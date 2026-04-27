// Salesforce-backed implementation of the Tough Customer service layer.
//
// Talks to the real tc5 dev-org schema via Salesforce REST GraphQL API.
// GraphQL enforces FLS + sharing for ALL profiles (admins included), giving
// us the same security guarantee Apex `WITH USER_MODE` would, with no Apex
// deploy. See docs/SALESFORCE_OBJECTS.md for the schema we query.
//
// Schema highlights (relative to the obsolete prototype):
//   - There is NO Tough_Customer__c filter on Opportunity. We list whatever
//     opportunities the calling user can see under sharing rules.
//   - There is NO Roleplay_Voice__c. Voices are hardcoded — see lib/voices.ts.
//   - Scenarios live in Scenario__c (Name + Description__c).
//   - "Creating a roleplay session" actually creates a ScenarioAssignment__c
//     row owned by the caller.

import {
  TCNotFoundError,
  type CoachContext,
  type CoachContextInput,
  type Contact,
  type CreateSessionInput,
  type Opportunity,
  type RoleplaySession,
  type Scenario,
  type Voice,
  type VoiceGender,
} from "./tc-service";
import { type SfAuth } from "./sf-auth";
import { sfGraphQL, val } from "./sf-graphql";
import { VOICES, findVoice } from "./voices";
import {
  buildCoachInstructions,
  type CoachContact,
  type CoachProduct,
} from "./coach-instructions";

// ─── Type aliases for raw GraphQL response shapes ────────────────────────

interface GqlNode<T> {
  edges: Array<{ node: T }>;
}
type GqlString = { value: string | null } | null;
type GqlNumber = { value: number | null } | null;

// ─── list_opportunities ─────────────────────────────────────────────────

interface OppNode {
  Id: string;
  Name: GqlString;
  StageName: GqlString;
  Amount: GqlNumber;
  Account: { Name: GqlString } | null;
}

export async function listOpportunitiesSF(auth: SfAuth): Promise<Opportunity[]> {
  // No "Tough_Customer__c" flag in this org — return what the user can see,
  // ordered most-recently-modified first. SF GraphQL enforces sharing.
  const data = await sfGraphQL<{
    uiapi: { query: { Opportunity: GqlNode<OppNode> } };
  }>(
    auth,
    /* GraphQL */ `
      query ListOpportunities {
        uiapi {
          query {
            Opportunity(
              orderBy: { LastModifiedDate: { order: DESC } }
              first: 50
            ) {
              edges {
                node {
                  Id
                  Name { value }
                  StageName { value }
                  Amount { value }
                  Account {
                    Name { value }
                  }
                }
              }
            }
          }
        }
      }
    `,
  );

  return data.uiapi.query.Opportunity.edges.map(({ node }) => ({
    id: node.Id,
    name: val(node.Name) ?? "",
    accountName: val(node.Account?.Name ?? null) ?? undefined,
    stage: val(node.StageName) ?? "",
    amount: val(node.Amount) ?? 0,
  }));
}

// ─── get_opportunity_contacts ───────────────────────────────────────────
//
// Uses OpportunityContactRole (the standard junction). FLS is enforced by
// GraphQL — a user only sees roles whose Contact they have access to.

interface OcrNode {
  Id: string;
  ContactId: GqlString;
  Role: GqlString;
  IsPrimary: { value: boolean | null } | null;
  Contact: {
    Id: string;
    Name: GqlString;
    Title: GqlString;
  } | null;
}

export async function getOpportunityContactsSF(
  auth: SfAuth,
  opportunityId: string,
): Promise<Contact[]> {
  if (!/^[a-zA-Z0-9]{15,18}$/.test(opportunityId)) {
    throw new Error(`Invalid Salesforce Opportunity Id: ${opportunityId}`);
  }

  const data = await sfGraphQL<{
    uiapi: {
      query: {
        Opportunity: GqlNode<{ Id: string }>;
        OpportunityContactRole: GqlNode<OcrNode>;
      };
    };
  }>(
    auth,
    /* GraphQL */ `
      query OppContacts($oppId: ID!) {
        uiapi {
          query {
            Opportunity(where: { Id: { eq: $oppId } }, first: 1) {
              edges { node { Id } }
            }
            OpportunityContactRole(
              where: { OpportunityId: { eq: $oppId } }
              first: 200
            ) {
              edges {
                node {
                  Id
                  ContactId { value }
                  Role { value }
                  IsPrimary { value }
                  Contact {
                    Id
                    Name { value }
                    Title { value }
                  }
                }
              }
            }
          }
        }
      }
    `,
    { oppId: opportunityId },
  );

  if (data.uiapi.query.Opportunity.edges.length === 0) {
    throw new TCNotFoundError("Opportunity", opportunityId);
  }

  return data.uiapi.query.OpportunityContactRole.edges
    .map(({ node }) => node)
    .filter((ocr) => ocr.Contact != null)
    // Sort primary contact first (orderBy on OpportunityContactRole isn't
    // accepted by SF GraphQL — at least not with the {Field:{order}} shape
    // that works on Opportunity. Sorting JS-side is fine for ≤200 rows.)
    .sort((a, b) => {
      const ap = a.IsPrimary?.value ? 1 : 0;
      const bp = b.IsPrimary?.value ? 1 : 0;
      return bp - ap;
    })
    .map((ocr) => ({
      id: ocr.Contact!.Id,
      opportunityId,
      name: val(ocr.Contact!.Name) ?? "",
      title: val(ocr.Contact!.Title) ?? val(ocr.Role) ?? "",
    }));
}

// ─── list_voices ───────────────────────────────────────────────────────
//
// Voices are NOT a SF object in this org — see docs/SALESFORCE_OBJECTS.md.
// Same hardcoded list in mock and live modes.

export async function listVoicesSF(_auth: SfAuth): Promise<Voice[]> {
  return VOICES;
}

// ─── list_scenarios ─────────────────────────────────────────────────────

interface ScenarioNode {
  Id: string;
  Name: GqlString;
  Description__c: GqlString;
  Type__c: GqlString;
}

export async function listScenariosSF(auth: SfAuth): Promise<Scenario[]> {
  const data = await sfGraphQL<{
    uiapi: { query: { Scenario__c: GqlNode<ScenarioNode> } };
  }>(
    auth,
    /* GraphQL */ `
      query ListScenarios {
        uiapi {
          query {
            Scenario__c(
              orderBy: { Name: { order: ASC } }
              first: 200
            ) {
              edges {
                node {
                  Id
                  Name { value }
                  Description__c { value }
                  Type__c { value }
                }
              }
            }
          }
        }
      }
    `,
  );

  return data.uiapi.query.Scenario__c.edges.map(({ node }) => ({
    id: node.Id,
    name: val(node.Name) ?? "",
    // Prefer the short description; fall back to scenario type tag.
    description:
      val(node.Description__c) ?? `Type: ${val(node.Type__c) ?? "Case"}`,
  }));
}

// ─── create_roleplay_session → launch URL ───────────────────────────────
//
// VALIDATES the picked context (opportunity, contact-on-opp, scenario,
// voice or voiceGender) and returns a Lightning launch URL. Does NOT
// write a ScenarioAssignment__c — the Learning LWC creates the assignment
// itself when the user clicks Start. The assignment-create mutation we
// previously did was rejected by SF GraphQL anyway
// (`ScenarioAssignment__c_CreateInput` type isn't on the live schema).
//
// dealContext fields still flow back to Claude so it can do pre-call
// coaching with the picked voice / contact / scenario.

import { randomBytes } from "node:crypto";

function buildLaunchUrl(args: {
  instanceUrl: string;
  opportunityId: string;
}): string {
  // The Learning LWC takes only `c__opp=<opportunityId>` from the URL.
  // Everything else (selected scenario / contact / voice / assignment) is
  // resolved by the LWC at session-start from the opportunity context and
  // the user's most recent ScenarioAssignment__c on it.
  const lightning = args.instanceUrl.replace(
    ".my.salesforce.com",
    ".lightning.force.com",
  );
  return `${lightning}/lightning/n/Learning?c__opp=${encodeURIComponent(args.opportunityId)}`;
}

export async function createRoleplaySessionSF(
  auth: SfAuth,
  input: CreateSessionInput,
): Promise<RoleplaySession> {
  // Voice is resolved against the local hardcoded catalog — fast, no SF call.
  let voice: Voice | undefined;
  let voicePreference:
    | { gender: VoiceGender; description: string }
    | undefined;
  if (input.voiceId) {
    voice = findVoice(input.voiceId);
    if (!voice) throw new TCNotFoundError("Voice", input.voiceId);
  } else if (input.voiceGender) {
    voicePreference = {
      gender: input.voiceGender,
      description: "AI-picked voice (gender preference)",
    };
  }

  // Build the GraphQL lookups conditionally — only for fields the caller
  // actually provided. Opportunity is always fetched (it's how we get
  // accountName / stage / amount for Claude's coaching).
  const wantContact = !!input.contactId;
  const wantScenario = !!input.scenarioId;

  const querySections: string[] = [];
  const queryArgs: string[] = ["$oppId: ID!"];
  const queryVars: Record<string, string> = { oppId: input.opportunityId };

  querySections.push(`
    Opportunity(where: { Id: { eq: $oppId } }, first: 1) {
      edges {
        node {
          Id
          Name { value }
          StageName { value }
          Amount { value }
          Account { Name { value } }
        }
      }
    }
  `);
  if (wantContact) {
    queryArgs.push("$contactId: ID!");
    queryVars.contactId = input.contactId!;
    querySections.push(`
      OpportunityContactRole(
        where: {
          and: [
            { OpportunityId: { eq: $oppId } }
            { ContactId: { eq: $contactId } }
          ]
        }
        first: 1
      ) {
        edges {
          node { Contact { Id Name { value } Title { value } } }
        }
      }
    `);
  }
  if (wantScenario) {
    queryArgs.push("$scenarioId: ID!");
    queryVars.scenarioId = input.scenarioId!;
    querySections.push(`
      Scenario__c(where: { Id: { eq: $scenarioId } }, first: 1) {
        edges {
          node {
            Id
            Name { value }
            Description__c { value }
            Type__c { value }
          }
        }
      }
    `);
  }

  const query = `query SessionLookups(${queryArgs.join(", ")}) {
    uiapi { query { ${querySections.join("\n")} } }
  }`;

  const lookups = await sfGraphQL<{
    uiapi: {
      query: {
        Opportunity: GqlNode<{
          Id: string;
          Name: GqlString;
          StageName: GqlString;
          Amount: GqlNumber;
          Account: { Name: GqlString } | null;
        }>;
        OpportunityContactRole?: GqlNode<{
          Contact: { Id: string; Name: GqlString; Title: GqlString } | null;
        }>;
        Scenario__c?: GqlNode<ScenarioNode>;
      };
    };
  }>(auth, query, queryVars);

  const oppNode = lookups.uiapi.query.Opportunity.edges[0]?.node;
  if (!oppNode) throw new TCNotFoundError("Opportunity", input.opportunityId);

  let ocrContact: { Id: string; Name: GqlString; Title: GqlString } | undefined;
  if (wantContact) {
    ocrContact =
      lookups.uiapi.query.OpportunityContactRole?.edges[0]?.node.Contact ??
      undefined;
    if (!ocrContact) {
      throw new TCNotFoundError(
        `Contact for opportunity ${input.opportunityId}`,
        input.contactId!,
      );
    }
  }

  let scenarioNode: ScenarioNode | undefined;
  if (wantScenario) {
    scenarioNode = lookups.uiapi.query.Scenario__c?.edges[0]?.node;
    if (!scenarioNode) throw new TCNotFoundError("Scenario", input.scenarioId!);
  }

  // No SF mutation — the Learning LWC creates the ScenarioAssignment__c
  // when the user clicks Start.
  const sessionId = "sess_" + randomBytes(8).toString("hex");
  const launchUrl = buildLaunchUrl({
    instanceUrl: auth.instanceUrl,
    opportunityId: input.opportunityId,
  });

  return {
    id: sessionId,
    url: launchUrl,
    createdAt: new Date().toISOString(),
    dealContext: {
      opportunity: {
        id: oppNode.Id,
        name: val(oppNode.Name) ?? "",
        accountName: val(oppNode.Account?.Name ?? null) ?? undefined,
        stage: val(oppNode.StageName) ?? "",
        amount: val(oppNode.Amount) ?? 0,
      },
      ...(ocrContact
        ? {
            contact: {
              id: ocrContact.Id,
              opportunityId: input.opportunityId,
              name: val(ocrContact.Name) ?? "",
              title: val(ocrContact.Title) ?? "",
            },
          }
        : {}),
      ...(voice ? { voice } : {}),
      ...(voicePreference ? { voicePreference } : {}),
      ...(scenarioNode
        ? {
            scenario: {
              id: scenarioNode.Id,
              name: val(scenarioNode.Name) ?? "",
              description:
                val(scenarioNode.Description__c) ??
                `Type: ${val(scenarioNode.Type__c) ?? "Case"}`,
            },
          }
        : {}),
      ...(input.backstory ? { backstory: input.backstory } : {}),
    },
  };
}

// ─── get_coach_context ──────────────────────────────────────────────────
//
// One round-trip to Salesforce that fetches everything the legacy oppGraph
// LWC merged client-side: scenario script, opportunity context (incl.
// MainCompetitors__c), all OpportunityContactRoles with full Contact
// fields, all OpportunityLineItems with their Product2. The merged
// instruction text is built server-side via buildCoachInstructions().

interface CoachOppNode {
  Id: string;
  Name: GqlString;
  StageName: GqlString;
  Amount: GqlNumber;
  Account: { Name: GqlString } | null;
  MainCompetitors__c: GqlString;
}
interface CoachScenarioNode {
  Id: string;
  Name: GqlString;
  Body__c: GqlString;
  Case__c: GqlString;
}
interface CoachOcrNode {
  Id: string;
  Role: GqlString;
  IsPrimary: { value: boolean | null } | null;
  Contact: {
    Id: string;
    Name: GqlString;
    Email: GqlString;
    Phone: GqlString;
    Title: GqlString;
    Department: GqlString;
    Account: { Name: GqlString } | null;
    MailingCity: GqlString;
    MailingState: GqlString;
    MailingCountry: GqlString;
    Description: GqlString;
  } | null;
}
interface CoachOliNode {
  Id: string;
  Quantity: GqlNumber;
  UnitPrice: GqlNumber;
  TotalPrice: GqlNumber;
  ServiceDate: { displayValue: string | null } | null;
  Product2: {
    Name: GqlString;
    Description: GqlString;
    Family: GqlString;
  } | null;
}

export async function getCoachContextSF(
  auth: SfAuth,
  input: CoachContextInput,
): Promise<CoachContext> {
  const data = await sfGraphQL<{
    uiapi: {
      query: {
        Scenario__c: GqlNode<CoachScenarioNode>;
        Opportunity: GqlNode<CoachOppNode>;
        OpportunityContactRole: GqlNode<CoachOcrNode>;
        OpportunityLineItem: GqlNode<CoachOliNode>;
      };
    };
  }>(
    auth,
    /* GraphQL */ `
      query CoachContext($oppId: ID!, $scenarioId: ID!) {
        uiapi {
          query {
            Scenario__c(where: { Id: { eq: $scenarioId } }, first: 1) {
              edges {
                node {
                  Id
                  Name { value }
                  Body__c { value }
                  Case__c { value }
                }
              }
            }
            Opportunity(where: { Id: { eq: $oppId } }, first: 1) {
              edges {
                node {
                  Id
                  Name { value }
                  StageName { value }
                  Amount { value }
                  Account { Name { value } }
                  MainCompetitors__c { value }
                }
              }
            }
            OpportunityContactRole(
              where: { OpportunityId: { eq: $oppId } }
              first: 50
            ) {
              edges {
                node {
                  Id
                  Role { value }
                  IsPrimary { value }
                  Contact {
                    Id
                    Name { value }
                    Email { value }
                    Phone { value }
                    Title { value }
                    Department { value }
                    Account { Name { value } }
                    MailingCity { value }
                    MailingState { value }
                    MailingCountry { value }
                    Description { value }
                  }
                }
              }
            }
            OpportunityLineItem(
              where: { OpportunityId: { eq: $oppId } }
              first: 100
            ) {
              edges {
                node {
                  Id
                  Quantity { value }
                  UnitPrice { value }
                  TotalPrice { value }
                  ServiceDate { displayValue }
                  Product2 {
                    Name { value }
                    Description { value }
                    Family { value }
                  }
                }
              }
            }
          }
        }
      }
    `,
    { oppId: input.opportunityId, scenarioId: input.scenarioId },
  );

  // Validate the two required pickers.
  const scenarioNode = data.uiapi.query.Scenario__c.edges[0]?.node;
  if (!scenarioNode) throw new TCNotFoundError("Scenario", input.scenarioId);

  const oppNode = data.uiapi.query.Opportunity.edges[0]?.node;
  if (!oppNode) throw new TCNotFoundError("Opportunity", input.opportunityId);

  // Sort OCRs primary-first (orderBy not accepted by SF GraphQL on this
  // connection — same workaround as get_opportunity_contacts).
  const ocrs = data.uiapi.query.OpportunityContactRole.edges
    .map(({ node }) => node)
    .filter((o) => o.Contact != null)
    .sort((a, b) => {
      const ap = a.IsPrimary?.value ? 1 : 0;
      const bp = b.IsPrimary?.value ? 1 : 0;
      return bp - ap;
    });

  // Pick: explicit contactId if provided; otherwise first (primary).
  let pickedOcr: CoachOcrNode | undefined;
  if (input.contactId) {
    pickedOcr = ocrs.find((o) => o.Contact?.Id === input.contactId);
    if (!pickedOcr) {
      throw new TCNotFoundError(
        `Contact for opportunity ${input.opportunityId}`,
        input.contactId,
      );
    }
  } else {
    pickedOcr = ocrs[0];
  }

  const contactForBuilder: CoachContact | undefined = pickedOcr?.Contact
    ? {
        name: val(pickedOcr.Contact.Name) ?? "",
        title: val(pickedOcr.Contact.Title) ?? undefined,
        email: val(pickedOcr.Contact.Email) ?? undefined,
        phone: val(pickedOcr.Contact.Phone) ?? undefined,
        department: val(pickedOcr.Contact.Department) ?? undefined,
        accountName: val(pickedOcr.Contact.Account?.Name ?? null) ?? undefined,
        mailingCity: val(pickedOcr.Contact.MailingCity) ?? undefined,
        mailingState: val(pickedOcr.Contact.MailingState) ?? undefined,
        mailingCountry: val(pickedOcr.Contact.MailingCountry) ?? undefined,
        description: val(pickedOcr.Contact.Description) ?? undefined,
      }
    : undefined;

  const products: CoachProduct[] = data.uiapi.query.OpportunityLineItem.edges.map(
    ({ node }) => ({
      productName: val(node.Product2?.Name ?? null) ?? undefined,
      productDescription: val(node.Product2?.Description ?? null) ?? undefined,
      productFamily: val(node.Product2?.Family ?? null) ?? undefined,
      quantity: val(node.Quantity) ?? undefined,
      unitPrice: val(node.UnitPrice) ?? undefined,
      totalPrice: val(node.TotalPrice) ?? undefined,
      serviceDate: node.ServiceDate?.displayValue ?? undefined,
    }),
  );

  const mainCompetitors = val(oppNode.MainCompetitors__c) ?? undefined;

  const { instructions, totalDealValue } = buildCoachInstructions({
    scenarioBody: val(scenarioNode.Body__c) ?? undefined,
    contact: contactForBuilder,
    products,
    mainCompetitors,
    backstory: input.backstory,
  });

  return {
    scenario: {
      id: scenarioNode.Id,
      name: val(scenarioNode.Name) ?? "",
      body: val(scenarioNode.Body__c) ?? undefined,
      case: val(scenarioNode.Case__c) ?? undefined,
    },
    opportunity: {
      id: oppNode.Id,
      name: val(oppNode.Name) ?? "",
      accountName: val(oppNode.Account?.Name ?? null) ?? undefined,
      stage: val(oppNode.StageName) ?? "",
      amount: val(oppNode.Amount) ?? 0,
      mainCompetitors,
    },
    ...(pickedOcr?.Contact
      ? {
          contact: {
            id: pickedOcr.Contact.Id,
            role: val(pickedOcr.Role) ?? undefined,
            isPrimary: pickedOcr.IsPrimary?.value ?? undefined,
            name: val(pickedOcr.Contact.Name) ?? "",
            title: val(pickedOcr.Contact.Title) ?? undefined,
            email: val(pickedOcr.Contact.Email) ?? undefined,
            phone: val(pickedOcr.Contact.Phone) ?? undefined,
            department: val(pickedOcr.Contact.Department) ?? undefined,
            accountName:
              val(pickedOcr.Contact.Account?.Name ?? null) ?? undefined,
            mailingCity: val(pickedOcr.Contact.MailingCity) ?? undefined,
            mailingState: val(pickedOcr.Contact.MailingState) ?? undefined,
            mailingCountry: val(pickedOcr.Contact.MailingCountry) ?? undefined,
            description: val(pickedOcr.Contact.Description) ?? undefined,
          },
        }
      : {}),
    products,
    totalDealValue,
    instructions,
    ...(input.backstory ? { backstory: input.backstory } : {}),
  };
}
