export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: "3rem auto", padding: "0 1rem", lineHeight: 1.6 }}>
      <h1>Tough Customer MCP</h1>
      <p>
        Model Context Protocol server that delivers a roleplay-link UI into Claude.
      </p>
      <p>
        MCP endpoint: <code>/mcp</code>
      </p>
      <p>
        Add this server to Claude as a remote MCP server pointing to{" "}
        <code>https://&lt;your-vercel-domain&gt;/mcp</code>.
      </p>
    </main>
  );
}
