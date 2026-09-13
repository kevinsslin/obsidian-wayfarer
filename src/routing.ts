import { TRANSIT_MODES, type Transport } from "./core/category";
import type { Day, Stop } from "./core/itinerary";
import { bareLeg, finishLeg, legKey, type Leg } from "./core/legs";
import { googleRoute, osrmRoute } from "./net";
import type { WayfarerSettings } from "./settings";

/**
 * Turns a day's stops into legs. Answers synchronously with what is known
 * (distance, and cached routes), then fetches routes for legs whose mode the
 * user has chosen and calls `onUpdate` once per batch so the pane redraws.
 */
export class LegRouter {
  private cache = new Map<string, Pick<Leg, "distanceM" | "durationS" | "geometry" | "summary" | "source">>();
  private inflight = new Set<string>();

  constructor(private settings: () => WayfarerSettings, private onUpdate: () => void) {}

  legsFor(day: Day, dayDate: Date | null): Leg[] {
    const legs: Leg[] = [];
    const missing: Array<{ from: Stop; to: Stop; mode: Transport; key: string; departure?: Date }> = [];
    for (let i = 1; i < day.stops.length; i++) {
      const from = day.stops[i - 1];
      const to = day.stops[i];
      const leg = bareLeg(from, to);
      if (!leg.mode) {
        legs.push(leg);
        continue;
      }
      const key = legKey(from, to, leg.mode);
      const hit = this.cache.get(key);
      if (hit) legs.push(finishLeg({ ...leg, ...hit, routed: true }));
      else {
        legs.push(leg);
        if (this.settings().routeLegs && !this.inflight.has(key)) missing.push({ from, to, mode: leg.mode, key, departure: departureFor(dayDate, from) });
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
          /* nothing to show; the leg keeps its distance only */
        } finally {
          this.inflight.delete(it.key);
        }
      }),
    );
    if (changed) this.onUpdate();
  }

  /**
   * Walking, cycling and driving are routed on OSRM; transit on Google when a
   * key is set. Flights and boats have no router. The public OSRM server
   * routes every profile as a car, so walking and cycling times are the
   * routed distance at a steady 4.5 km/h and 14 km/h.
   */
  private async route(from: Stop, to: Stop, mode: Transport, departure?: Date): Promise<Pick<Leg, "distanceM" | "durationS" | "geometry" | "summary" | "source"> | null> {
    const s = this.settings();
    if (mode === "flight" || mode === "boat") return null;
    const transit = TRANSIT_MODES.has(mode);
    if (s.googleApiKey && (transit || s.preferGoogleRoutes)) {
      const gm = transit ? "TRANSIT" : mode === "walk" ? "WALK" : mode === "bike" ? "BICYCLE" : "DRIVE";
      const r = await googleRoute(s.googleApiKey, s.languageCode, from, to, gm, departure);
      if (r) return { ...r, source: "google" };
    }
    if (transit) return null;
    const r = await osrmRoute(from, to);
    if (!r) return null;
    const durationS = mode === "car" || mode === "taxi" ? r.durationS : mode === "bike" ? Math.round(r.distanceM / (14000 / 3600)) : Math.round(r.distanceM / (4500 / 3600));
    return { distanceM: r.distanceM, durationS, geometry: r.geometry, source: "osrm" };
  }
}

/** Departure for a transit query: the day's date with the stop's written time, else undefined. */
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
