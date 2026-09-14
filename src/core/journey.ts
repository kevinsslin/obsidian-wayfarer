import type { Itinerary, Stop } from "./itinerary";

/** Stable across line insertion; ambiguous repeated visits fail closed. */
export interface StopRef {
  day: string;
  dayOccurrence: number;
  dayCount: number;
  name: string;
  lat: number;
  lng: number;
  occurrence: number;
  count: number;
}
export interface Progress { current: StopRef | null; finished: boolean }

export function stopRef(it: Itinerary, stop: Stop): StopRef {
  const day = it.days.find((d) => d.index === stop.dayIndex)!;
  const days = it.days.filter((d) => d.title === day.title);
  const matches = day.stops.filter((s) => s.name === stop.name && s.lat === stop.lat && s.lng === stop.lng);
  return { day: day.title, dayOccurrence: days.indexOf(day), dayCount: days.length, name: stop.name, lat: stop.lat, lng: stop.lng, occurrence: matches.indexOf(stop), count: matches.length };
}

export function resolveStop(it: Itinerary, ref: StopRef | null): Stop | null {
  if (!ref) return null;
  const days = it.days.filter((d) => d.title === ref.day);
  if (days.length !== ref.dayCount) return null;
  const matches = days[ref.dayOccurrence]?.stops.filter((s) => s.name === ref.name && s.lat === ref.lat && s.lng === ref.lng) ?? [];
  return matches.length === ref.count ? matches[ref.occurrence] ?? null : null;
}

export function nextStop(it: Itinerary, current: Stop): Stop | null {
  const i = it.stops.indexOf(current);
  return i < 0 ? null : it.stops[i + 1] ?? null;
}

export function previousStop(it: Itinerary, current: Stop): Stop | null {
  const i = it.stops.indexOf(current);
  return i > 0 ? it.stops[i - 1] : null;
}

export function readProgress(raw: unknown): Progress {
  const empty: Progress = { current: null, finished: false };
  if (!raw || typeof raw !== "object") return empty;
  const data = raw as Record<string, unknown>;
  if (!data.current || typeof data.current !== "object") return empty;
  const r = data.current as StopRef;
  const validIndex = (i: number, count: number) => Number.isInteger(i) && i >= 0 && Number.isInteger(count) && count > i;
  if (typeof r.day !== "string" || typeof r.name !== "string" || !Number.isFinite(r.lat) || Math.abs(r.lat) > 90 || !Number.isFinite(r.lng) || Math.abs(r.lng) > 180 || !validIndex(r.occurrence, r.count) || !validIndex(r.dayOccurrence, r.dayCount)) return empty;
  return { current: { day: r.day, dayOccurrence: r.dayOccurrence, dayCount: r.dayCount, name: r.name, lat: r.lat, lng: r.lng, occurrence: r.occurrence, count: r.count }, finished: data.finished === true };
}
