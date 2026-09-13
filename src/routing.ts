import type { Transport } from "./core/category";
import type { Day, Stop } from "./core/itinerary";
import { estimateDurationS, estimateLeg, finishLeg, haversineM, legKey, legMode, type Leg } from "./core/legs";
import { googleRoute, osrmRoute, type RouteResult } from "./net";
import type { WayfarerSettings } from "./settings";

/**
 * Turns a day's stops into legs. Answers synchronously with estimates and
 * cached routes, then fetches what is missing and calls `onUpdate` once per
 * batch so the pane can redraw. Results are cached by endpoints and mode.
 */
export class LegRouter {
  private cache = new Map<string, Omit<Leg, "from" | "to" | "lateBy">>();
  private inflight = new Set<string>();

  constructor(private settings: () => WayfarerSettings, private onUpdate: () => void) {}

  legsFor(day: Day, dayDate: Date | null): Leg[] {
    const legs: Leg[] = [];
    const missing: Array<{ from: Stop; to: Stop; mode: Transport; key: string; departure?: Date }> = [];
    for (let i = 1; i < day.stops.length; i++) {
      const from = day.stops[i - 1];
      const to = day.stops[i];
      const mode = legMode(to, haversineM(from, to));
      const key = legKey(from, to, mode);
      const hit = this.cache.get(key);
      if (hit) legs.push(finishLeg({ ...hit, from, to }));
      else {
        legs.push(estimateLeg(from, to));
        if (this.settings().routeLegs && mode !== "flight" && mode !== "boat" && !this.inflight.has(key)) {
          missing.push({ from, to, mode, key, departure: departureFor(dayDate, from) });
        }
      }
    }
    if (missing.length) void this.fetch(missing);
    return legs;
  }

  private async fetch(items: Array<{ from: Stop; to: Stop; mode: Transport; key: string; departure?: Date }>): Promise<void> {
    for (const it of items) this.inflight.add(it.key);
    let changed = false;
    await Promise.all(
      items.map(async (it) => {
        try {
          const r = await this.route(it.from, it.to, it.mode, it.departure);
          if (r) {
            this.cache.set(it.key, r);
            changed = true;
          }
        } catch {
          /* leave the estimate in place */
        } finally {
          this.inflight.delete(it.key);
        }
      }),
    );
    if (changed) this.onUpdate();
  }

  private async route(from: Stop, to: Stop, mode: Transport, departure?: Date): Promise<Omit<Leg, "from" | "to" | "lateBy"> | null> {
    const s = this.settings();
    const transitLike = mode === "train" || mode === "bus";
    if (s.googleApiKey && (transitLike || s.preferGoogleRoutes)) {
      const gm = transitLike ? "TRANSIT" : mode === "walk" ? "WALK" : mode === "bike" ? "BICYCLE" : "DRIVE";
      const r = await googleRoute(s.googleApiKey, s.languageCode, from, to, gm, departure);
      if (r) return { ...r, mode, source: "google" };
    }
    if (transitLike) return null; // no free transit router; keep the estimate
    const r: RouteResult | null = await osrmRoute(from, to);
    if (!r) return null;
    // OSRM's demo routes as a car whatever the profile; derive walking and cycling time from its distance.
    const durationS = mode === "car" ? r.durationS : estimateDurationS(mode, r.distanceM);
    return { ...r, durationS, mode, source: "osrm" };
  }
}

/** Departure for a transit query: the day's date with the stop's written time, else null. */
export function departureFor(dayDate: Date | null, from: Stop): Date | undefined {
  if (!dayDate || !from.time) return undefined;
  const [h, m] = from.time.split(":").map(Number);
  const d = new Date(dayDate);
  d.setHours(h, m, 0, 0);
  return d;
}

/** Turns a heading label such as "9/17" into the next occurrence of that date. */
export function dateFromLabel(label: string, now = new Date()): Date | null {
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec(label);
  if (!m) return null;
  const d = new Date(now.getFullYear(), Number(m[1]) - 1, Number(m[2]));
  if (d.getTime() < now.getTime() - 86400000 * 3) d.setFullYear(d.getFullYear() + 1);
  return d;
}
