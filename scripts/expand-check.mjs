// Live check of the short-link expansion strategy used in src/net.ts:
// walk redirects with a non-browser User-Agent, since maps.app.goo.gl serves a
// 200 interstitial to browser UAs and only gives Location to other clients.
// Also exercises Nominatim once. Network required; not part of `pnpm check`.
//
// Usage: node scripts/expand-check.mjs [short-url]
import https from "node:https";

const UA = "ObsidianWayfarer/0.1 (+https://github.com/kevinsslin/wayfarer)";
const url = process.argv[2] ?? "https://maps.app.goo.gl/TvPZdQo9HRmnfb4d8";

async function expand(start, maxHops = 5) {
  let current = start;
  for (let i = 0; i < maxHops; i++) {
    const location = await new Promise((resolve, reject) => {
      const req = https.request(current, { method: "GET", headers: { "User-Agent": UA, Accept: "*/*" } }, (res) => {
        res.resume();
        const loc = res.headers.location;
        console.log(`  ${res.statusCode} ${current.slice(0, 90)}`);
        if (res.statusCode >= 300 && res.statusCode < 400 && loc) resolve(new URL(loc, current).href);
        else resolve(null);
      });
      req.setTimeout(8000, () => req.destroy(new Error("timeout")));
      req.on("error", reject);
      req.end();
    });
    if (!location) return current;
    current = location;
    if (!/goo\.gl|g\.co/.test(new URL(current).hostname)) return current;
  }
  return current;
}

const final = await expand(url);
console.log("final:", final);
const at = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(final) ?? /search\/(-?\d+\.\d+),\+?(-?\d+\.\d+)/.exec(final);
console.log("coords:", at ? `${at[1]}, ${at[2]}` : "none in URL");

const q = "千光寺 尾道";
const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`, { headers: { "User-Agent": UA } });
const hit = (await res.json())[0];
console.log("nominatim:", hit ? `${hit.name} ${hit.lat},${hit.lon}` : "no hit", res.status);
