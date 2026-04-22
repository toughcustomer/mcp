import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { generateRoleplayLink, TEMPLATES } from "@/lib/roleplays";
import { renderRoleplayAppHtml, UI_RESOURCE_URI } from "@/lib/ui";

export const runtime = "nodejs";
export const maxDuration = 60;

const handler = createMcpHandler(
  (server) => {
    server.registerResource(
      "toughcustomer-roleplay-app",
      UI_RESOURCE_URI,
      {
        title: "Tough Customer Roleplay App",
        description: "Interactive UI for generating Tough Customer roleplay links.",
        mimeType: "text/html",
      },
      async (uri) => ({
        contents: [
          {
            uri: uri.href,
            mimeType: "text/html",
            text: renderRoleplayAppHtml(),
          },
        ],
      }),
    );

    server.registerTool(
      "toughcustomer_open_roleplay_app",
      {
        title: "Open Roleplay App",
        description:
          "Open the Tough Customer roleplay configurator UI inline. User picks a persona/scenario and generates a shareable roleplay link.",
        inputSchema: {
          persona: z
            .string()
            .max(500)
            .optional()
            .describe("Optional persona to pre-fill in the form."),
          scenario: z
            .string()
            .max(2000)
            .optional()
            .describe("Optional scenario to pre-fill."),
          difficulty: z
            .enum(["easy", "medium", "hard"])
            .optional()
            .describe("Optional difficulty to pre-select."),
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async ({ persona, scenario, difficulty }) => {
        const html = renderRoleplayAppHtml({ persona, scenario, difficulty });
        return {
          content: [
            {
              type: "text",
              text: "Tough Customer roleplay configurator — fill in the form and click Generate.",
            },
            {
              type: "resource",
              resource: {
                uri: UI_RESOURCE_URI,
                mimeType: "text/html",
                text: html,
              },
            },
          ],
          _meta: {
            "mcpui.dev/ui-resource": UI_RESOURCE_URI,
            "openai/outputTemplate": UI_RESOURCE_URI,
          },
        };
      },
    );

    server.registerTool(
      "toughcustomer_create_roleplay_link",
      {
        title: "Create Roleplay Link",
        description:
          "Generate a Tough Customer roleplay link for a given persona, scenario, and difficulty. Returns the URL and also renders the configurator UI with the result.",
        inputSchema: {
          persona: z.string().min(1).max(500).describe("Buyer persona."),
          scenario: z.string().min(1).max(2000).describe("Scenario setup."),
          difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
          objections: z
            .array(z.string().max(200))
            .max(20)
            .optional()
            .describe("Optional list of objection themes."),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      async (input) => {
        const link = generateRoleplayLink({
          persona: input.persona,
          scenario: input.scenario,
          difficulty: input.difficulty ?? "medium",
          objections: input.objections,
        });
        const html = renderRoleplayAppHtml({
          link,
          persona: link.persona,
          scenario: link.scenario,
          difficulty: link.difficulty,
        });
        return {
          content: [
            { type: "text", text: `Roleplay link: ${link.url}` },
            {
              type: "resource",
              resource: {
                uri: UI_RESOURCE_URI,
                mimeType: "text/html",
                text: html,
              },
            },
          ],
          structuredContent: { ...link },
          _meta: {
            "mcpui.dev/ui-resource": UI_RESOURCE_URI,
            "openai/outputTemplate": UI_RESOURCE_URI,
          },
        };
      },
    );

    server.registerTool(
      "toughcustomer_list_templates",
      {
        title: "List Roleplay Templates",
        description:
          "List the built-in Tough Customer roleplay templates (persona + scenario presets).",
        inputSchema: {},
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async () => ({
        content: [
          { type: "text", text: JSON.stringify(TEMPLATES, null, 2) },
        ],
        structuredContent: { templates: [...TEMPLATES] },
      }),
    );
  },
  {},
  {
    basePath: "",
    maxDuration: 60,
    verboseLogs: false,
  },
);

export { handler as GET, handler as POST, handler as DELETE };
