import type { MarkdownPostProcessor } from "obsidian";
import { todayHours } from "./map-view";
import { parseMeta, type PlaceMeta } from "../core/itinerary";

/**
 * Reading view: `geo:` links open Google Maps (Obsidian has no handler for
 * the geo scheme), and the `%%wf:{}%%` comment, which Obsidian already hides,
 * is surfaced as a rating and hours chip after the link.
 */
export const readingPostProcessor: MarkdownPostProcessor = (el, ctx) => {
  const links = el.querySelectorAll<HTMLAnchorElement>('a[href^="geo:"]');
  if (links.length === 0) return;
  const section = ctx.getSectionInfo(el);
  const sourceLines = section ? section.text.split("\n").slice(section.lineStart, section.lineEnd + 1).join("\n") : "";

  links.forEach((a) => {
    const m = /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(a.getAttribute("href") ?? "");
    if (!m) return;
    a.setAttribute("href", `https://www.google.com/maps/search/?api=1&query=${m[1]},${m[2]}`);
    a.addClass("wf-geo-link");
    a.setAttr("target", "_blank");
    a.setAttr("rel", "noopener");

    const meta = metaFor(sourceLines, a.textContent ?? "", m[1], m[2]);
    if (!meta) return;
    const chip = document.createElement("span");
    chip.className = "wf-meta";
    const bits: string[] = [];
    if (meta.rating) bits.push(`★ ${meta.rating.toFixed(1)}`);
    const today = todayHours(meta.hours);
    if (today) bits.push(today.replace(/^[^:]+:\s*/, ""));
    if (bits.length === 0) return;
    chip.textContent = bits.join(" · ");
    chip.title = [meta.address, ...(meta.hours ?? [])].filter(Boolean).join("\n");
    a.insertAdjacentElement("afterend", chip);
  });
};

function metaFor(source: string, name: string, lat: string, lng: string): PlaceMeta | null {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\[${esc(name)}\\]\\(geo:${esc(lat)},${esc(lng)}[^)]*\\)\\s*%%wf:(\\{.*?\\})%%`);
  const m = re.exec(source);
  if (!m) return null;
  return parseMeta(m[1]) ?? null;
}
