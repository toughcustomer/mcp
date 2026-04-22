import { TEMPLATES, type RoleplayLink } from "./roleplays";

export const UI_RESOURCE_URI = "ui://toughcustomer/roleplay.html";

export function renderRoleplayAppHtml(seed?: {
  link?: RoleplayLink;
  persona?: string;
  scenario?: string;
  difficulty?: "easy" | "medium" | "hard";
}): string {
  const seedJson = JSON.stringify(seed ?? {});
  const templatesJson = JSON.stringify(TEMPLATES);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Tough Customer — Roleplay Link</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0;
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #fafafa;
    color: #111;
  }
  .wrap { max-width: 560px; margin: 0 auto; padding: 20px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  p.lede { margin: 0 0 16px; color: #555; }
  label { display: block; font-weight: 600; margin: 12px 0 4px; }
  input, select, textarea {
    width: 100%; box-sizing: border-box; padding: 8px 10px;
    border: 1px solid #d0d0d0; border-radius: 6px; background: #fff; color: inherit;
    font: inherit;
  }
  textarea { min-height: 64px; resize: vertical; }
  .row { display: flex; gap: 8px; }
  .row > * { flex: 1; }
  button {
    margin-top: 16px; padding: 10px 14px; background: #111; color: #fff;
    border: none; border-radius: 6px; font-weight: 600; cursor: pointer; width: 100%;
  }
  button:hover { background: #000; }
  .templates { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
  .chip {
    font-size: 12px; padding: 4px 8px; border: 1px solid #ccc; border-radius: 999px;
    background: #fff; cursor: pointer;
  }
  .chip:hover { background: #eee; }
  .result {
    margin-top: 18px; padding: 14px; background: #fff;
    border: 1px solid #e0e0e0; border-radius: 8px;
  }
  .result h2 { margin: 0 0 6px; font-size: 15px; }
  .result a { word-break: break-all; color: #0366d6; }
  .copy { font-size: 12px; margin-left: 8px; background: transparent; color: #0366d6; border: 0; cursor: pointer; padding: 0; width: auto; }
  .muted { color: #777; font-size: 12px; }
  @media (prefers-color-scheme: dark) {
    body { background: #0d0d0d; color: #eee; }
    input, select, textarea, .chip, .result { background: #1a1a1a; border-color: #333; color: #eee; }
    button { background: #eee; color: #111; }
    p.lede, .muted { color: #999; }
    .result a { color: #6aa9ff; }
  }
</style>
</head>
<body>
  <div class="wrap">
    <h1>Generate a Tough Customer roleplay link</h1>
    <p class="lede">Configure a buyer persona and scenario. Submit to get a shareable roleplay URL.</p>

    <div class="templates" id="templates"></div>

    <label for="persona">Persona</label>
    <input id="persona" placeholder="e.g. Skeptical CFO at a mid-market SaaS company" />

    <label for="scenario">Scenario</label>
    <textarea id="scenario" placeholder="e.g. Cold discovery call — evaluating AI spend"></textarea>

    <div class="row">
      <div>
        <label for="difficulty">Difficulty</label>
        <select id="difficulty">
          <option value="easy">Easy</option>
          <option value="medium" selected>Medium</option>
          <option value="hard">Hard</option>
        </select>
      </div>
      <div>
        <label for="objections">Objections (comma-separated)</label>
        <input id="objections" placeholder="price, timing, security" />
      </div>
    </div>

    <button id="submit">Generate roleplay link</button>

    <div id="result"></div>
    <p class="muted" style="margin-top:18px">Demo — link points to toughcustomer.ai with mock IDs.</p>
  </div>

<script type="module">
  const seed = ${seedJson};
  const templates = ${templatesJson};

  const $ = (id) => document.getElementById(id);
  const personaEl = $("persona"), scenarioEl = $("scenario"),
        difficultyEl = $("difficulty"), objectionsEl = $("objections"),
        resultEl = $("result"), templatesEl = $("templates");

  for (const t of templates) {
    const b = document.createElement("button");
    b.className = "chip"; b.type = "button"; b.textContent = t.persona;
    b.onclick = () => {
      personaEl.value = t.persona;
      scenarioEl.value = t.scenario;
      difficultyEl.value = t.difficulty;
    };
    templatesEl.appendChild(b);
  }

  if (seed.persona) personaEl.value = seed.persona;
  if (seed.scenario) scenarioEl.value = seed.scenario;
  if (seed.difficulty) difficultyEl.value = seed.difficulty;
  if (seed.link) renderLink(seed.link);

  $("submit").onclick = async () => {
    const payload = {
      persona: personaEl.value.trim(),
      scenario: scenarioEl.value.trim(),
      difficulty: difficultyEl.value,
      objections: objectionsEl.value.split(",").map((s) => s.trim()).filter(Boolean),
    };
    if (!payload.persona || !payload.scenario) {
      resultEl.innerHTML = '<div class="result">Please fill in persona and scenario.</div>';
      return;
    }
    resultEl.innerHTML = '<div class="result">Generating…</div>';
    try {
      const res = await fetch("/api/roleplays", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const link = await res.json();
      renderLink(link);
    } catch (e) {
      resultEl.innerHTML = '<div class="result">Error: ' + String(e) + '</div>';
    }
  };

  function renderLink(link) {
    resultEl.innerHTML =
      '<div class="result">' +
        '<h2>Roleplay ready</h2>' +
        '<div><strong>' + escapeHtml(link.persona) + '</strong> — ' + escapeHtml(link.difficulty) + '</div>' +
        '<div class="muted">' + escapeHtml(link.scenario) + '</div>' +
        '<p><a href="' + link.url + '" target="_blank" rel="noopener">' + link.url + '</a>' +
        '<button class="copy" type="button" id="copy">Copy</button></p>' +
      '</div>';
    const btn = document.getElementById("copy");
    if (btn) btn.onclick = () => navigator.clipboard?.writeText(link.url);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
</script>
</body>
</html>`;
}
