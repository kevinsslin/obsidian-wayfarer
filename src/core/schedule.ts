import type { Category } from "./category";
import type { Day } from "./itinerary";
import { t } from "./i18n";
import { minutesOf, type Leg } from "./legs";

/** `~1h30`, `~45m`, `~45分`, `~2h` anywhere on a stop's line. */
export const DWELL_RE = /(?:^|\s)~(?:(\d+)\s*[hH時]\s*(\d+)?\s*(?:m|分)?|(\d+)\s*(?:m|min|分))(?=\s|$|[,，。])/;

export function parseDwell(line: string): number | undefined {
  const m = DWELL_RE.exec(line);
  if (!m) return undefined;
  if (m[3]) return Number(m[3]);
  return Number(m[1]) * 60 + Number(m[2] ?? 0);
}

/** Categories one passes through rather than stays at. */
export const PASS_THROUGH = new Set<Category>(["station", "airport", "port"]);

export interface Slot {
  /** Minutes from midnight. Written on the line, or inferred from the previous stop plus the leg. */
  arrive?: number;
  /** Known only when the stay is known (set by the user) or the stop is a pass-through. */
  depart?: number;
  /** True when `arrive` was inferred rather than written. */
  inferred: boolean;
  /** The user's stay, or 0 for stations and airports; undefined means unknown. */
  dwellMin?: number;
  /** Minutes the inferred arrival lands after the written time, or 0. */
  lateBy: number;
}

/**
 * Walks a day forward. A written time is an anchor: the stop is taken to
 * start then even if the inferred arrival is later (that gap is `lateBy`).
 * Nothing is guessed about how long a stop takes: a stay comes from the
 * user, or is zero for places one passes through (stations, airports,
 * ports). Where the stay is unknown the inference stops until the next anchor.
 */
export function buildSchedule(day: Day, legs: Leg[]): Slot[] {
  const out: Slot[] = [];
  let prevDepart: number | undefined;
  day.stops.forEach((stop, i) => {
    const written = minutesOf(stop.time);
    const leg = i > 0 ? legs[i - 1] : undefined;
    const predicted = prevDepart !== undefined && leg ? prevDepart + Math.round(leg.durationS / 60) : undefined;
    const dwellMin = stop.dwellMin ?? (PASS_THROUGH.has(stop.category) ? 0 : undefined);
    let arrive: number | undefined;
    let inferred = false;
    let lateBy = 0;
    if (written !== null) {
      arrive = written;
      if (predicted !== undefined && predicted > written) lateBy = predicted - written;
    } else if (predicted !== undefined) {
      arrive = predicted;
      inferred = true;
    }
    const isLast = i === day.stops.length - 1;
    const depart = arrive !== undefined && !isLast && dwellMin !== undefined ? arrive + dwellMin : undefined;
    out.push({ arrive, depart, inferred, dwellMin, lateBy });
    prevDepart = depart;
  });
  return out;
}

export function fmtMin(m: number): string {
  const mm = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(mm / 60)).padStart(2, "0")}:${String(mm % 60).padStart(2, "0")}`;
}

/* ---------- opening hours ---------- */

export interface DayHours {
  closed: boolean;
  allDay: boolean;
  /** [open, close] in minutes; close may exceed 1440 for past-midnight closing. */
  ranges: [number, number][];
}

const WEEKDAY_WORDS: string[][] = [
  ["sunday", "星期日", "週日", "周日", "日曜日", "sun"],
  ["monday", "星期一", "週一", "周一", "月曜日", "mon"],
  ["tuesday", "星期二", "週二", "周二", "火曜日", "tue"],
  ["wednesday", "星期三", "週三", "周三", "水曜日", "wed"],
  ["thursday", "星期四", "週四", "周四", "木曜日", "thu"],
  ["friday", "星期五", "週五", "周五", "金曜日", "fri"],
  ["saturday", "星期六", "週六", "周六", "土曜日", "sat"],
];

/** Finds the weekdayDescriptions line for a weekday (0 = Sunday). */
export function hoursForWeekday(hours: string[] | undefined, weekday: number): string | null {
  if (!hours?.length) return null;
  const words = WEEKDAY_WORDS[weekday];
  return hours.find((h) => words.some((w) => h.toLowerCase().startsWith(w))) ?? hours[(weekday + 6) % 7] ?? null;
}

/** Parses "Monday: 9:00 AM – 5:00 PM", "星期一: 09:00 – 17:00, 18:00 – 22:00", "Closed", "Open 24 hours". */
export function parseDayHours(desc: string): DayHours {
  const body = desc.replace(/^[^:：]*[:：]\s*/, "").trim();
  const lower = body.toLowerCase();
  if (!body || /closed|休息|休業|定休|公休|休み/.test(lower)) return { closed: true, allDay: false, ranges: [] };
  if (/24\s*hours|24\s*小時|24\s*時間|營業 24/.test(lower)) return { closed: false, allDay: true, ranges: [[0, 1440]] };
  const ranges: [number, number][] = [];
  const re = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|上午|下午)?\s*[–—-]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|上午|下午)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const open = toMin(m[1], m[2], m[3] ?? m[6]);
    let close = toMin(m[4], m[5], m[6]);
    if (close <= open) close += 1440;
    ranges.push([open, close]);
  }
  return { closed: ranges.length === 0, allDay: false, ranges };
}

function toMin(h: string, mm: string | undefined, ap: string | undefined): number {
  let hour = Number(h);
  const min = Number(mm ?? 0);
  const a = ap?.toLowerCase();
  if (a === "pm" || a === "下午") hour = hour % 12 + 12;
  if (a === "am" || a === "上午") hour = hour % 12;
  return hour * 60 + min;
}

export type HoursStatus =
  | { kind: "ok" }
  | { kind: "closed-day" }
  | { kind: "not-open-yet"; opensAt: number }
  | { kind: "already-closed"; closedAt: number }
  | { kind: "closes-soon"; closedAt: number };

/** Checks an arrival (minutes) against that weekday's hours. Null when there is nothing to check. */
export function checkHours(hours: string[] | undefined, weekday: number, arrive: number | undefined, dwellMin: number | undefined = 0): HoursStatus | null {
  const line = hoursForWeekday(hours, weekday);
  if (!line || arrive === undefined) return null;
  const dh = parseDayHours(line);
  if (dh.closed) return { kind: "closed-day" };
  if (dh.allDay) return { kind: "ok" };
  const inside = dh.ranges.find(([o, c]) => arrive >= o && arrive < c);
  if (inside) return dwellMin && arrive + dwellMin > inside[1] ? { kind: "closes-soon", closedAt: inside[1] } : { kind: "ok" };
  const next = dh.ranges.find(([o]) => o > arrive);
  if (next) return { kind: "not-open-yet", opensAt: next[0] };
  return { kind: "already-closed", closedAt: dh.ranges[dh.ranges.length - 1][1] };
}

export function describeHours(s: HoursStatus): string | null {
  switch (s.kind) {
    case "ok": return null;
    case "closed-day": return t("closed_day");
    case "not-open-yet": return t("opens_at", { t: fmtMin(s.opensAt) });
    case "already-closed": return t("closed_at", { t: fmtMin(s.closedAt) });
    case "closes-soon": return t("closes_soon", { t: fmtMin(s.closedAt) });
  }
}

/** Trailer this plugin writes at the end of a stop's line: ` · 🚶 34 分 · 2.5 km · ≈10:05 到`. */
export const WRITTEN_LEG_RE = /\s·\s(?:🚶|🚃|🚌|🚕|✈️|⛴️|🚲)\s≈?[\d 時分間hmin]+(?:\s·\s[\d.]+\s?(?:m|km))?(?:\s·\s≈\d{2}:\d{2}[^·]{0,8})?\s*$/u;

export function legTrailer(legText: string, distanceText: string | null, arrive: number | undefined, inferred: boolean): string {
  const bits = [legText];
  if (distanceText) bits.push(distanceText);
  if (inferred && arrive !== undefined) bits.push(t("arrive_at", { t: fmtMin(arrive) }));
  return ` · ${bits.join(" · ")}`;
}

/** Full-line pass: pulls a stop's line minus the trailer, and the trailer itself. */
export function splitTrailer(line: string): { base: string; trailer: string } {
  const m = WRITTEN_LEG_RE.exec(line);
  return m ? { base: line.slice(0, m.index), trailer: m[0] } : { base: line, trailer: "" };
}
