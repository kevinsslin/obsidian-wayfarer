// Drives a running Obsidian (launched with --remote-debugging-port=9222)
// over the Chrome DevTools Protocol. Dev/test helper, not shipped.
//
//   node scripts/cdp.mjs eval '<js expression>'      evaluate in the renderer (awaits promises)
//   node scripts/cdp.mjs shot out.png                 screenshot the window
//   node scripts/cdp.mjs targets                      list page targets
//
// Picks the page whose title contains OBSIDIAN_VAULT (default "test-vault").
import { writeFileSync } from "node:fs";

const PORT = process.env.CDP_PORT ?? "9222";
const VAULT = process.env.OBSIDIAN_VAULT ?? "test-vault";
const [cmd, ...rest] = process.argv.slice(2);

const targets = await (await fetch(`http://localhost:${PORT}/json`)).json();
if (cmd === "targets") {
  for (const t of targets) console.log(t.type, "|", t.title, "|", t.webSocketDebuggerUrl);
  process.exit(0);
}
async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  const send = (method, params = {}, timeoutMs = 15000) =>
    new Promise((resolve) => {
      const i = ++id;
      const timer = setTimeout(() => { pending.delete(i); resolve({ timeout: true }); }, timeoutMs);
      pending.set(i, (msg) => { clearTimeout(timer); resolve(msg); });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  return { ws, send };
}

// Window titles lag behind (a fresh window is titled by its URL), so ask each
// page which vault it holds.
let conn = null;
for (const t of targets.filter((t) => t.type === "page")) {
  const c = await connect(t.webSocketDebuggerUrl);
  const r = await c.send("Runtime.evaluate", { expression: "typeof app !== 'undefined' && app.vault ? app.vault.getName() : ''", returnByValue: true }, 3000);
  if (r.timeout) console.error(`(page ${t.title || t.url} did not answer)`);
  if (r.result?.result?.value === VAULT) { conn = c; break; }
  c.ws.close();
}
if (!conn) {
  console.error(`no page holds vault "${VAULT}"`);
  process.exit(1);
}
const { ws, send } = conn;

if (cmd === "eval") {
  const expression = rest.join(" ");
  const res = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (res.result?.exceptionDetails) {
    console.error("EXCEPTION:", res.result.exceptionDetails.exception?.description ?? JSON.stringify(res.result.exceptionDetails));
    process.exit(1);
  }
  const v = res.result?.result?.value;
  console.log(typeof v === "string" ? v : JSON.stringify(v, null, 2));
} else if (cmd === "shot") {
  const out = rest[0] ?? "shot.png";
  const res = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(out, Buffer.from(res.result.data, "base64"));
  console.log("wrote", out);
} else {
  console.error("unknown command");
  process.exit(1);
}
ws.close();
process.exit(0);
