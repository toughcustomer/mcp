export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: "3rem auto", padding: "0 1rem", lineHeight: 1.6 }}>
      <h1>Tough Customer MCP</h1>
      <p>
        Model Context Protocol server exposing the Tough Customer roleplay setup
        workflow (opportunities → contacts → voices → scenarios → session) to LLMs.
      </p>
      <p>
        MCP endpoint: <code>/mcp</code>
      </p>
      <h2>Resources</h2>
      <ul>
        <li>
          <code>toughcustomer://opportunities</code>
        </li>
        <li>
          <code>toughcustomer://scenarios</code>
        </li>
        <li>
          <code>toughcustomer://voices</code>
        </li>
      </ul>
      <h2>Tools</h2>
      <ul>
        <li>
          <code>get_opportunity_contacts</code>
        </li>
        <li>
          <code>create_roleplay_session</code>
        </li>
      </ul>
      <h2>Prompts</h2>
      <ul>
        <li>
          <code>setup_sales_roleplay</code>
        </li>
      </ul>
      <p>
        Backend is mocked — swap the functions in <code>lib/tc-service.ts</code> for real
        Tough Customer API calls.
      </p>
    </main>
  );
}
