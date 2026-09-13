import type { Transport } from "./category";
import { t } from "./i18n";
import type { Day, Stop } from "./itinerary";

/** One move between consecutive stops of a day. */
export interface Leg {
  from: Stop;
  to: Stop;
  mode: Transport;
  distanceM: number;
  durationS: number;
  /** Route geometry when a router supplied one; otherwise the straight line. */
  geometry: [number, number][];
  /** Transit line names, e.g. "東武日光線 → 日光 2 號". */
  summary?: string;
  source: "osrm" | "google" | "estimate";
  /** Minutes the user would arrive after the next stop's written time; 0 when on time or unknown. */
  lateBy: number;
}

export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

/** The mode to route with: the word the user wrote, else walk for short hops and train beyond. */
export function legMode(to: Stop, distanceM: number): Transport {
  if (to.transport) return to.transport;
  if (to.category === "airport" && distanceM > 150_000) return "flight";
  return distanceM < 1500 ? "walk" : "train";
}

/** Rough duration when no router answered: straight-line speed plus a fixed overhead. */
export function estimateDurationS(mode: Transport, distanceM: number): number {
  const table: Record<Transport, [mPerMin: number, overheadMin: number]> = {
    walk: [75, 0],
    bike: [230, 2],
    car: [450, 5],
    bus: [280, 8],
    train: [650, 12],
    boat: [400, 15],
    flight: [11000, 120],
  };
  const [speed, overhead] = table[mode];
  return Math.round((distanceM / speed + overhead) * 60);
}

export function estimateLeg(from: Stop, to: Stop): Leg {
  const distanceM = haversineM(from, to);
  const mode = legMode(to, distanceM);
  return finishLeg({ from, to, mode, distanceM, durationS: estimateDurationS(mode, distanceM), geometry: [[from.lat, from.lng], [to.lat, to.lng]], source: "estimate" });
}

/** Fills in lateness from the stops' written times. */
export function finishLeg(leg: Omit<Leg, "lateBy">): Leg {
  const a = minutesOf(leg.from.time);
  const b = minutesOf(leg.to.time);
  let lateBy = 0;
  if (a !== null && b !== null) {
    const gap = (b - a + 1440) % 1440;
    lateBy = Math.max(0, Math.round(leg.durationS / 60 - gap));
  }
  return { ...leg, lateBy };
}

export function minutesOf(time: string | undefined): number | null {
  const m = time && /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Cache key for a leg; mode and endpoints only, rounded so tiny edits reuse the answer. */
export function legKey(from: Stop, to: Stop, mode: Transport): string {
  const r = (n: number) => n.toFixed(4);
  return `${mode}:${r(from.lat)},${r(from.lng)}>${r(to.lat)},${r(to.lng)}`;
}

export function formatDuration(s: number): string {
  const min = Math.round(s / 60);
  if (min < 60) return t("min", { n: min });
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? t("hours_min", { h, m }) : t("hours", { h });
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

/** Totals for a day: moving time and the span from first to last written time. */
export function daySummary(day: Day, legs: Leg[]): { movingS: number; first?: string; last?: string; late: number } {
  const times = day.stops.map((s) => s.time).filter((t): t is string => !!t);
  return {
    movingS: legs.reduce((a, l) => a + l.durationS, 0),
    first: times[0],
    last: times.length > 1 ? times[times.length - 1] : undefined,
    late: legs.filter((l) => l.lateBy > 0).length,
  };
}

/** Decodes a Google encoded polyline into [lat, lng] pairs. */
export function decodePolyline(str: string): [number, number][] {
  const out: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < str.length) {
    for (const which of [0, 1]) {
      let result = 0;
      let shift = 0;
      let b: number;
      do {
        b = str.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += delta;
      else lng += delta;
    }
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}
