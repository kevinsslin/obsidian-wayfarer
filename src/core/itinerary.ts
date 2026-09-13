/**
 * Parses a note into days and stops.
 *
 * Stops are Map View compatible inline geolinks: `[Name](geo:lat,lng)`,
 * optionally followed by `tag:x` tokens and a `%%wf:{...}%%` metadata comment
 * that this plugin writes when it has place details.
 *
 * Days are headings. Every stop belongs to the nearest heading above it; stops
 * before the first heading land in an unnamed group.
 */

export interface PlaceMeta {
  /** Google rating, 1 to 5. */
  rating?: number;
  /** Weekday opening hours as printed by Google, e.g. "Monday: 9:00 AM – 5:00 PM". */
  hours?: string[];
  address?: string;
  website?: string;
  placeId?: string;
  /** Google primaryType, e.g. "shinto_shrine". */
  type?: string;
  /** Google photo resource name (`places/…/photos/…`), fetched with the user's key at render time. */
  photo?: string;
  /** How the user gets here, chosen in the timeline. Wins over words on the line. */
  via?: Transport;
  /** Planned stay in minutes, chosen in the timeline. Wins over `~1h30` on the line. */
  stay?: number;
}

export interface Stop {
  name: string;
  lat: number;
  lng: number;
  /** Zero-based line in the note. */
  line: number;
  /** Character offsets of the whole `[..](geo:..)` link within the line. */
  from: number;
  to: number;
  tags: string[];
  meta?: PlaceMeta;
  /** Emoji the user wrote before the link on this line, if any. */
  emoji?: string;
  category: Category;
  /** Leading "HH:MM" on the line, if any. */
  time?: string;
  /** How one gets here: chosen in the timeline, read from words before the link, or guessed from distance. */
  transport?: Transport;
  transportSource: "chosen" | "words" | "guessed";
  /** Planned stay in minutes, from `~1h30` on the line. */
  dwellMin?: number;
  /** The line's prose with links reduced to their names and markup removed. */
  note: string;
  /** Image on the same line or the line after: a vault `![[file]]` link or a URL. */
  image?: string;
  /** Index within its day, zero-based. */
  index: number;
  dayIndex: number;
}

export interface Day {
  /** Heading text without the leading `#`s. Empty for stops above the first heading. */
  title: string;
  /** Zero-based line of the heading, or -1 for the unnamed group. */
  headingLine: number;
  /** First line after this day's range (exclusive). */
  endLine: number;
  stops: Stop[];
  /** Zero-based position among days that have at least one stop. */
  index: number;
  /** Short label such as "9/17" if the heading carries a date, else the title. */
  label: string;
}

export interface Itinerary {
  days: Day[];
  /** Every stop in document order. */
  stops: Stop[];
}

export interface ParseOptions {
  /**
   * Heading level that starts a day. Default 2 (`##`). Shallower headings
   * (the note's title) do not start days. When the note has no heading at this
   * level, any heading up to it counts, so a note written with `#` days works.
   */
  maxHeadingLevel?: number;
}

import { firstEmoji, pickCategory, transportFrom, type Category, type Transport } from "./category";
import { DWELL_RE, parseDwell, WRITTEN_LEG_RE } from "./schedule";

const GEO_LINK = /\[([^\]]*)\]\(geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:[^)]*)\)/g;
const TRAILER = /^((?:\s+tag:[^\s%]+)*)/;
const META = /%%wf:(\{.*?\})%%/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const FENCE = /^\s*(```|~~~)/;
const TIME = /^\s*(?:[-*+]|\d+[.)])?\s*(?:\S\s+)?(\d{1,2}:\d{2})/u;
const IMAGE = /!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]|!\[[^\]]*\]\((\S+?)\)/;

export function parseItinerary(markdown: string, opts: ParseOptions = {}): Itinerary {
  const maxLevel = opts.maxHeadingLevel ?? 2;
  const lines = markdown.split("\n");
  const hasExact = lines.some((l) => { const h = HEADING.exec(l); return h && h[1].length === maxLevel; });
  const isDayHeading = (level: number) => (hasExact ? level === maxLevel : level <= maxLevel);
  const days: Day[] = [];
  let current: Day = { title: "", headingLine: -1, endLine: lines.length, stops: [], index: -1, label: "" };
  let inFence = false;
  let inFrontmatter = lines[0] === "---";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (inFrontmatter) {
      if (i > 0 && line.trim() === "---") inFrontmatter = false;
      continue;
    }
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const h = HEADING.exec(line);
    if (h && isDayHeading(h[1].length)) {
      current.endLine = i;
      days.push(current);
      current = { title: h[2], headingLine: i, endLine: lines.length, stops: [], index: -1, label: dayLabel(h[2]) };
      continue;
    }

    GEO_LINK.lastIndex = 0;
    let m: RegExpExecArray | null;
    let prevEnd = 0;
    const time = TIME.exec(line)?.[1];
    const dwellMin = parseDwell(line);
    const image = IMAGE.exec(line) ?? (lines[i + 1] && !HEADING.test(lines[i + 1]) ? IMAGE.exec(lines[i + 1]) : null);
    while ((m = GEO_LINK.exec(line))) {
      const lat = Number(m[2]);
      const lng = Number(m[3]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const rest = line.slice(m.index + m[0].length);
      const t = TRAILER.exec(rest);
      const tags = (t?.[1] ?? "").split(/\s+/).filter((x) => x.startsWith("tag:")).map((x) => x.slice(4));
      // metadata may sit anywhere after the link, before the next link
      const nextLink = rest.search(/\[[^\]]*\]\(geo:/);
      const scope = nextLink === -1 ? rest : rest.slice(0, nextLink);
      let meta: PlaceMeta | undefined;
      const mm = META.exec(scope);
      if (mm) {
        try {
          meta = JSON.parse(mm[1]) as PlaceMeta;
        } catch {
          meta = undefined;
        }
      }
      const before = line.slice(prevEnd, m.index);
      prevEnd = m.index + m[0].length;
      const name = m[1] || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      current.stops.push({
        name,
        lat,
        lng,
        line: i,
        from: m.index,
        to: m.index + m[0].length,
        tags,
        meta,
        emoji: firstEmoji(before.replace(/\d{1,2}:\d{2}/, "")) ?? undefined,
        category: pickCategory({ tags, googleType: meta?.type, name }),
        time,
        transport: meta?.via ?? transportFrom(before) ?? undefined,
        transportSource: meta?.via ? "chosen" : transportFrom(before) ? "words" : "guessed",
        dwellMin: meta?.stay ?? dwellMin,
        note: plainNote(line),
        image: image ? (image[1] ?? image[2]) : undefined,
        index: current.stops.length,
        dayIndex: -1,
      });
    }
  }
  days.push(current);

  const withStops = days.filter((d) => d.stops.length > 0);
  withStops.forEach((d, i) => {
    d.index = i;
    d.stops.forEach((s) => (s.dayIndex = i));
  });
  return { days: withStops, stops: withStops.flatMap((d) => d.stops) };
}

/** The line as prose: list marker, time, links (kept as names), tags, meta and images removed. */
export function plainNote(line: string): string {
  return line
    .replace(WRITTEN_LEG_RE, "")
    .replace(DWELL_RE, " ")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s*/, "")
    .replace(/%%wf:\{.*?\}%%/g, "")
    .replace(/\s+tag:\S+/g, "")
    .replace(IMAGE, "")
    .replace(/\[([^\]]*)\]\(geo:[^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/!?\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_, a: string, b?: string) => b ?? a)
    .replace(/[*_`]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/^\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*\s*/u, "");
}

/** Which day (by index) contains the given zero-based line, or -1. */
export function dayAtLine(it: Itinerary, line: number): number {
  for (const d of it.days) {
    const start = d.headingLine === -1 ? 0 : d.headingLine;
    if (line >= start && line < d.endLine) return d.index;
  }
  return -1;
}

/** Pulls a compact date label out of a heading, e.g. "9/17 週四 上山" -> "9/17". */
export function dayLabel(title: string): string {
  const iso = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(title);
  if (iso) return `${Number(iso[2])}/${Number(iso[3])}`;
  const slash = /(?:^|\D)(\d{1,2})\/(\d{1,2})(?!\d)/.exec(title);
  if (slash) return `${Number(slash[1])}/${Number(slash[2])}`;
  const cjk = /(\d{1,2})\s*月\s*(\d{1,2})\s*日/.exec(title);
  if (cjk) return `${Number(cjk[1])}/${Number(cjk[2])}`;
  const mon = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})\b/i.exec(title);
  if (mon) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    return `${months.indexOf(mon[1].slice(0, 3).toLowerCase()) + 1}/${Number(mon[2])}`;
  }
  const dayWord = /\bday\s*(\d{1,2})\b/i.exec(title);
  if (dayWord) return `D${dayWord[1]}`;
  return title.length > 12 ? title.slice(0, 12) : title;
}

/**
 * Returns the line with `patch` merged into its `%%wf:{}%%` comment, adding
 * one after the link (and tags) when the line has none. Used when the user
 * changes transport or stay in the timeline.
 */
export function patchLineMeta(line: string, patch: Partial<PlaceMeta>): string {
  const mm = META.exec(line);
  let meta: PlaceMeta = {};
  if (mm) {
    try { meta = JSON.parse(mm[1]) as PlaceMeta; } catch { meta = {}; }
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null) delete (meta as Record<string, unknown>)[k];
    else (meta as Record<string, unknown>)[k] = v;
  }
  const text = Object.keys(meta).length ? `%%wf:${JSON.stringify(compactMeta(meta))}%%` : "";
  if (mm) return (line.slice(0, mm.index) + text + line.slice(mm.index + mm[0].length)).replace(/\s{2,}/g, " ").replace(/\s+$/, "");
  if (!text) return line;
  GEO_LINK.lastIndex = 0;
  let last: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = GEO_LINK.exec(line))) last = m;
  if (!last) return line;
  const after = last.index + last[0].length;
  const tagsLen = TRAILER.exec(line.slice(after))?.[1].length ?? 0;
  const at = after + tagsLen;
  return `${line.slice(0, at)} ${text}${line.slice(at)}`;
}

/** Serialises a stop back to its inline form. */
export function formatStop(name: string, lat: number, lng: number, tags: string[] = [], meta?: PlaceMeta, emoji?: string): string {
  const parts = [`${emoji ? emoji + " " : ""}[${name.replace(/[[\]]/g, "")}](geo:${round(lat)},${round(lng)})`];
  for (const t of tags) parts.push(`tag:${t}`);
  if (meta && Object.keys(meta).length > 0) parts.push(`%%wf:${JSON.stringify(compactMeta(meta))}%%`);
  return parts.join(" ");
}

function compactMeta(meta: PlaceMeta): PlaceMeta {
  const out: PlaceMeta = {};
  if (meta.rating !== undefined) out.rating = Math.round(meta.rating * 10) / 10;
  if (meta.hours?.length) out.hours = meta.hours;
  if (meta.address) out.address = meta.address;
  if (meta.website) out.website = meta.website;
  if (meta.placeId) out.placeId = meta.placeId;
  if (meta.type) out.type = meta.type;
  if (meta.photo) out.photo = meta.photo;
  if (meta.via) out.via = meta.via;
  if (meta.stay !== undefined) out.stay = meta.stay;
  return out;
}

function round(n: number): string {
  return String(Math.round(n * 1e6) / 1e6);
}
