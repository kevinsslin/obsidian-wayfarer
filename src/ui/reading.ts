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
  const occurrences = section ? linksIn(section.text, section.lineStart, section.lineEnd) : [];

  links.forEach((a) => {
    const m = /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(a.getAttribute("href") ?? "");
    if (!m) return;
    a.setAttribute("href", `https://www.google.com/maps/search/?api=1&query=${m[1]},${m[2]}`);
    a.addClass("wf-geo-link");
    a.setAttr("target", "_blank");
    a.setAttr("rel", "noopener");

    // The same place can be linked twice in a section; each rendered link takes the next unused source link.
    const name = a.textContent ?? "";
    const hit = occurrences.find((o) => !o.used && o.name === name && o.lat === m[1] && o.lng === m[2]);
    if (!hit) return;
    hit.used = true;
    const meta = hit.meta;
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

interface Occurrence { name: string; lat: string; lng: string; meta: PlaceMeta | undefined; used: boolean }

const LINK_RE = /\[([^\]]*)\]\(geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)[^)]*\)(?:\s*%%wf:(\{.*?\})%%)?/g;

let lastText = "";
let lastLines: string[] = [];

/** Geo links of the section's lines in source order. `text` is the whole note, split once and reused across sections. */
function linksIn(text: string, lineStart: number, lineEnd: number): Occurrence[] {
  if (text !== lastText) {
    lastText = text;
    lastLines = text.split("\n");
  }
  const src = lastLines.slice(lineStart, lineEnd + 1).join("\n");
  const out: Occurrence[] = [];
  LINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LINK_RE.exec(src))) out.push({ name: m[1], lat: m[2], lng: m[3], meta: m[4] ? parseMeta(m[4]) : undefined, used: false });
  return out;
}
