import type { Transport } from "./category";
import { t } from "./i18n";
import type { LegMeta, Stop } from "./itinerary";

/**
 * One move between consecutive stops of a day. The mode is known only when
 * the user chose it (in the timeline, or by writing a transport emoji before
 * the link); the duration is known only when a router answered for that
 * mode. Nothing here is estimated.
 */
export interface Leg {
  from: Stop;
  to: Stop;
  mode?: Transport;
  /** Straight-line distance until a router supplies the routed one. */
  distanceM: number;
  routed: boolean;
  durationS?: number;
  /** Route geometry when a router supplied one; otherwise the straight line. */
  geometry: [number, number][];
  /** Transit line names, e.g. "東武日光線 → 日光 2 號". */
  summary?: string;
  source?: "google";
  /** Minutes the leg overruns the gap between the two written times; 0 when on time or unknown. */
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

/**
 * A leg with what the note alone knows: the mode, the straight-line distance,
 * and, when the stop carries a route saved for this same previous stop and
 * mode, that route's duration, distance and line names.
 */
export function bareLeg(from: Stop, to: Stop): Leg {
  const straight: [number, number][] = [[from.lat, from.lng], [to.lat, shortWayLng(from.lng, to.lng)]];
  const saved = to.meta?.leg;
  if (saved && to.transport && saved.via === to.transport && saved.from === coordKey(from)) {
    return finishLeg({ from, to, mode: to.transport, distanceM: saved.m, durationS: saved.s, summary: saved.line, routed: true, source: "google", geometry: straight });
  }
  return finishLeg({ from, to, mode: to.transport, distanceM: haversineM(from, to), routed: false, geometry: straight });
}

/** Rounded coordinates that identify a stop in saved leg metadata. */
export function coordKey(p: { lat: number; lng: number }): string {
  return `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
}

/** What to save on the destination stop after a route came back. */
export function legMetaFor(from: Stop, leg: Pick<Leg, "durationS" | "distanceM" | "summary">, via: NonNullable<Stop["transport"]>): LegMeta | null {
  if (leg.durationS === undefined) return null;
  const out: LegMeta = { from: coordKey(from), via, s: Math.round(leg.durationS), m: Math.round(leg.distanceM) };
  if (leg.summary) out.line = leg.summary;
  return out;
}

/** Fills in lateness from the stops' written times, when the duration is known. */
export function finishLeg(leg: Omit<Leg, "lateBy">): Leg {
  const a = minutesOf(leg.from.time);
  const b = minutesOf(leg.to.time);
  let lateBy = 0;
  if (a !== null && b !== null && leg.durationS !== undefined) {
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

/** Numbers for a leg, without the mode: duration when routed, distance, transit lines. */
export function legText(leg: Leg): string {
  const bits: string[] = [];
  if (leg.durationS !== undefined) bits.push(formatDuration(leg.durationS));
  bits.push(formatDistance(leg.distanceM));
  if (leg.summary) bits.push(leg.summary);
  return bits.join(" · ");
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

/**
 * The destination longitude shifted by a full turn when that is the shorter
 * way round, so a straight line 羽田 to SFO crosses the Pacific instead of
 * being drawn the long way over Eurasia.
 */
export function shortWayLng(fromLng: number, toLng: number): number {
  const d = toLng - fromLng;
  if (d > 180) return toLng - 360;
  if (d < -180) return toLng + 360;
  return toLng;
}
