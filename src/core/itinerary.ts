/**
 * Parses a note into days and stops.
 *
 * Stops are Map View compatible inline geolinks: `[Name](geo:lat,lng)`,
 * optionally followed by a `%%wf:{...}%%` metadata comment
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
  /** How the user gets here, chosen in the timeline or written as an emoji before the link. */
  via?: Transport;
  /**
   * The route Google returned for the leg into this stop, kept so companions
   * without a key see the same numbers. `from` is the previous stop's
   * rounded coordinates: after a reorder it no longer matches and the entry
   * is ignored and refetched.
   */
  leg?: LegMeta;
}

export interface LegMeta {
  from: string;
  via: Transport;
  /** Duration in seconds and distance in metres. */
  s: number;
  m: number;
  /** Transit line names, when any. */
  line?: string;
  /** The route's shape as an encoded polyline, simplified to a few dozen points, so the map can draw the road without asking again. */
  p?: string;
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
  /** Where the text before this link starts on the line (line start, or the end of the previous link). */
  beforeFrom: number;
  meta?: PlaceMeta;
  /** Emoji the user wrote before the link on this line, if any. */
  emoji?: string;
  category: Category;
  /** Leading "HH:MM" on the line, if any. */
  time?: string;
  /** How one gets here: chosen in the timeline, or a transport emoji the user wrote before the link. Otherwise unknown. */
  transport?: Transport;
  /** The line's prose with links reduced to their names and markup removed. */
  note: string;
  /** Indented lines right under the stop, verbatim: the user's notes for it. */
  notes: string[];
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
  /** The full date in the heading (`2026-09-17`), or null when the heading has none. */
  date: { year: number; month: number; day: number } | null;
  /**
   * Last date of a range heading (`2026-09-19 ~ 2026-09-26 東京`), or null.
   * A range is one block on the map; since the day is not certain, nothing is checked against a weekday.
   */
  dateEnd: { year: number; month: number; day: number } | null;
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

import { TRANSPORT_EMOJI, firstEmoji, isTransportEmoji, pickCategory, transportEmoji, type Category, type Transport } from "./category";

const GEO_LINK = /\[([^\]]*)\]\(geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:[^)]*)\)/g;
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
  let current: Day = { title: "", headingLine: -1, endLine: lines.length, stops: [], index: -1, label: "", date: null, dateEnd: null };
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
      current = { title: h[2], headingLine: i, endLine: lines.length, stops: [], index: -1, label: dayLabel(h[2]), date: dayDate(h[2]), dateEnd: dayDateEnd(h[2]) };
      continue;
    }

    GEO_LINK.lastIndex = 0;
    let m: RegExpExecArray | null;
    let prevEnd = 0;
    const time = TIME.exec(line)?.[1];
    const image = IMAGE.exec(line) ?? imageBelow(lines, i);
    while ((m = GEO_LINK.exec(line))) {
      const lat = Number(m[2]);
      const lng = Number(m[3]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const rest = line.slice(m.index + m[0].length);
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
      const emojiBefore = firstEmoji(before.replace(/\d{1,2}:\d{2}/, ""));
      current.stops.push({
        name,
        lat,
        lng,
        line: i,
        from: m.index,
        beforeFrom: m.index - before.length,
        to: m.index + m[0].length,
        meta,
        emoji: emojiBefore && !isTransportEmoji(emojiBefore) ? emojiBefore : undefined,
        category: pickCategory({ googleType: meta?.type, name }),
        time,
        // The emoji in the text is what everyone reads, so it wins; `via` is only read from older notes.
        transport: transportEmoji(before) ?? meta?.via ?? undefined,
        note: plainNote(line),
        notes: continuationLines(lines, i),
        image: image ? (image[1] ?? image[2]) : undefined,
        index: current.stops.length,
        dayIndex: -1,
      });
    }
  }
  days.push(current);

  // Once a note has dated headings, the undated sections are notes (research, to-dos, candidates):
  // their links stay in the text but are not part of the trip on the map.
  const dated = days.some((d) => d.date);
  const withStops = days.filter((d) => d.stops.length > 0 && (!dated || d.date));
  withStops.forEach((d, i) => {
    d.index = i;
    d.stops.forEach((s) => (s.dayIndex = i));
  });
  return { days: withStops, stops: withStops.flatMap((d) => d.stops) };
}

/**
 * Lines directly under `line` that are indented deeper than it, with list
 * markers and leading whitespace removed. Image-only lines are left out
 * (they become the stop's picture instead).
 */
export function continuationLines(lines: string[], line: number): string[] {
  const indentOf = (l: string) => /^\s*/.exec(l)![0].replace(/\t/g, "    ").length;
  const base = indentOf(lines[line]);
  const out: string[] = [];
  for (let j = line + 1; j < lines.length; j++) {
    const l = lines[j];
    if (!l.trim()) break;
    if (indentOf(l) <= base || HEADING.test(l)) break;
    const text = l.replace(/^\s*(?:[-*+]|\d+[.)])\s*/, "").trim();
    if (IMAGE.test(text) && text.replace(IMAGE, "").trim() === "") continue;
    out.push(text);
  }
  return out;
}

/** An image on one of the indented lines under `line`. */
function imageBelow(lines: string[], line: number): RegExpExecArray | null {
  const indentOf = (l: string) => /^\s*/.exec(l)![0].replace(/\t/g, "    ").length;
  const base = indentOf(lines[line]);
  for (let j = line + 1; j < lines.length; j++) {
    const l = lines[j];
    if (!l.trim() || indentOf(l) <= base || HEADING.test(l)) return null;
    const m = IMAGE.exec(l);
    if (m) return m;
  }
  return null;
}

/** The line as prose: list marker, time, links (kept as names), meta and images removed. */
export function plainNote(line: string): string {
  return line
    .replace(/^\s*(?:[-*+]|\d+[.)])\s*/, "")
    .replace(/%%wf:\{.*?\}%%/g, "")
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

/**
 * The date of a day heading. Only a full `YYYY-MM-DD` counts: anything
 * shorter would need a guessed year, and the weekday, hours and departure
 * checks all hang on the date being certain.
 */
export function dayDate(title: string): Day["date"] {
  return validDate(/(\d{4})-(\d{2})-(\d{2})/.exec(title));
}

/**
 * The end of a range heading: a second full date after the first, joined by
 * `~`, `～`, `-`, `–`, `to` or `到` (`2026-09-19 ~ 2026-09-26 東京`). Null when
 * there is none or it is not after the start.
 */
export function dayDateEnd(title: string): Day["date"] {
  const m = /(\d{4})-(\d{2})-(\d{2})\s*(?:[~～\-–]|to|到)\s*(\d{4})-(\d{2})-(\d{2})/.exec(title);
  if (!m) return null;
  const start = validDate([m[0], m[1], m[2], m[3]] as unknown as RegExpExecArray);
  const end = validDate([m[0], m[4], m[5], m[6]] as unknown as RegExpExecArray);
  if (!start || !end) return null;
  const key = (d: NonNullable<Day["date"]>) => d.year * 10000 + d.month * 100 + d.day;
  return key(end) > key(start) ? end : null;
}

function validDate(m: RegExpExecArray | null): Day["date"] {
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day ? { year, month, day } : null;
}

/** Pulls a compact date label out of a heading, e.g. "2026-09-17 週四 上山" -> "9/17", a range -> "9/19~9/26". */
export function dayLabel(title: string): string {
  const end = dayDateEnd(title);
  const iso = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(title);
  if (iso && end) return `${Number(iso[2])}/${Number(iso[3])}~${end.month}/${end.day}`;
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

const TRANSPORT_TOKEN = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*/gu;

/**
 * Returns the line with the stop's transport written as the emoji before its
 * link: the transport emoji already there is replaced in place, otherwise
 * one is inserted right before the link. A legacy `via` in the metadata is
 * dropped so the text is the only place the choice lives. Nothing else moves.
 */
export function setTransportOnLine(line: string, stop: Pick<Stop, "from" | "beforeFrom">, mode: Transport): string {
  const emoji = TRANSPORT_EMOJI[mode];
  const before = line.slice(stop.beforeFrom, stop.from);
  let out: string | null = null;
  for (const m of before.matchAll(TRANSPORT_TOKEN)) {
    if (!isTransportEmoji(m[0])) continue;
    const at = stop.beforeFrom + (m.index ?? 0);
    out = line.slice(0, at) + emoji + line.slice(at + m[0].length);
    break;
  }
  if (out === null) out = line.slice(0, stop.from) + emoji + " " + line.slice(stop.from);
  // A route saved for another mode is stale now; drop it rather than leave it behind.
  const mm = META.exec(out);
  let savedVia: string | undefined;
  if (mm) {
    try { savedVia = (JSON.parse(mm[1]) as PlaceMeta).leg?.via; } catch { savedVia = undefined; }
  }
  return patchLineMeta(out, savedVia && savedVia !== mode ? { via: undefined, leg: undefined } : { via: undefined });
}

/**
 * Returns the line with `patch` merged into its `%%wf:{}%%` comment, adding
 * one after the link (and tags) when the line has none. Used when the user
 * changes transport in the timeline. Everything outside the comment is kept byte for byte.
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
  if (mm) {
    // Replace only the metadata span; when it goes away take one adjacent space with it.
    let start = mm.index;
    let end = mm.index + mm[0].length;
    if (!text) {
      if (start > 0 && line[start - 1] === " ") start--;
      else if (line[end] === " ") end++;
    }
    return line.slice(0, start) + text + line.slice(end);
  }
  if (!text) return line;
  GEO_LINK.lastIndex = 0;
  let last: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = GEO_LINK.exec(line))) last = m;
  if (!last) return line;
  const after = last.index + last[0].length;
  const at = after;
  return `${line.slice(0, at)} ${text}${line.slice(at)}`;
}

/** Serialises a stop back to its inline form. */
export function formatStop(name: string, lat: number, lng: number, meta?: PlaceMeta, emoji?: string): string {
  const parts = [`${emoji ? emoji + " " : ""}[${name.replace(/[[\]]/g, "")}](geo:${round(lat)},${round(lng)})`];
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
  if (meta.leg) out.leg = meta.leg;
  return out;
}

function round(n: number): string {
  return String(Math.round(n * 1e6) / 1e6);
}

/**
 * The user's notes for a stop, verbatim: its line as prose (time removed,
 * the place name kept where it was written), then the indented lines under
 * it. A line that is nothing but the name adds nothing.
 */
export function stopNotes(stop: Stop): string[] {
  let line = stop.note;
  if (stop.time) line = line.replace(stop.time, " ");
  line = line.replace(/\s+/g, " ").trim();
  return line && line !== stop.name ? [line, ...stop.notes] : [...stop.notes];
}

/**
 * Moves the block starting at line `from` (the line plus every deeper-indented
 * line under it) to sit where line `to` is: before it when moving up, after
 * its block when moving down. Same rule as the drag in the timeline.
 */
export function moveBlock(lines: string[], from: number, to: number): string[] {
  const indentOf = (l: string) => (/^\s*/.exec(l) as RegExpExecArray)[0].replace(/\t/g, "    ").length;
  const blockLen = (ls: string[], ln: number): number => {
    const base = indentOf(ls[ln]);
    let n = 1;
    while (ln + n < ls.length && ls[ln + n].trim() && indentOf(ls[ln + n]) > base) n++;
    return n;
  };
  if (from < 0 || from >= lines.length || to < 0 || to >= lines.length || from === to) return lines;
  const count = blockLen(lines, from);
  const block = lines.slice(from, from + count);
  const rest = [...lines.slice(0, from), ...lines.slice(from + count)];
  // Moving down: the target line has shifted up by the removed block; land after the target's own block.
  const at = from < to ? Math.min(rest.length, to - count + blockLen(rest, to - count)) : to;
  return [...rest.slice(0, at), ...block, ...rest.slice(at)];
}
