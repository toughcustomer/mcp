export const metadata = {
  title: "Tough Customer MCP",
  description: "MCP server that delivers a Tough Customer roleplay UI into Claude.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>{children}</body>
    </html>
  );
}
