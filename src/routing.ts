import { TRANSIT_MODES, type Transport } from "./core/category";
import type { Day, Stop } from "./core/itinerary";
import { bareLeg, finishLeg, legKey, legMetaFor, type Leg } from "./core/legs";
import type { LegMeta } from "./core/itinerary";
import { googleRoute } from "./net";
import type { WayfarerSettings } from "./settings";

/**
 * Turns a day's stops into legs. Answers synchronously with what is known
 * (distance, and cached routes), then asks Google Routes for legs whose mode
 * the user has chosen and calls `onUpdate` once per batch so the pane
 * redraws. Without a Google key nothing is fetched: a leg is its distance.
 */
export class LegRouter {
  private cache = new Map<string, Pick<Leg, "distanceM" | "durationS" | "geometry" | "summary" | "source">>();
  private inflight = new Set<string>();

  /**
   * `onRouted` receives the destination stop's line and what to save on it,
   * so the numbers travel with the note.
   */
  constructor(private settings: () => WayfarerSettings, private onUpdate: () => void, private onRouted?: (line: number, leg: LegMeta) => void) {}

  legsFor(day: Day, dayDate: Date | null): Leg[] {
    const legs: Leg[] = [];
    const missing: Array<{ from: Stop; to: Stop; mode: Transport; key: string; departure?: Date }> = [];
    for (let i = 1; i < day.stops.length; i++) {
      const from = day.stops[i - 1];
      const to = day.stops[i];
      const leg = bareLeg(from, to);
      if (!leg.mode || !routable(leg.mode) || !this.settings().googleApiKey) {
        legs.push(leg);
        continue;
      }
      const key = legKey(from, to, leg.mode);
      const hit = this.cache.get(key);
      if (hit) legs.push(finishLeg({ ...leg, ...hit, routed: true }));
      else {
        // Saved numbers show at once; the road geometry is still fetched once per session.
        legs.push(leg);
        if (!this.inflight.has(key)) missing.push({ from, to, mode: leg.mode, key, departure: departureFor(dayDate, from) });
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
          const s = this.settings();
          const r = await googleRoute(s.googleApiKey, s.languageCode, it.from, it.to, googleMode(it.mode), it.departure);
          if (r) {
            this.cache.set(it.key, { ...r, source: "google" });
            changed = true;
            const meta = legMetaFor(it.from, r, it.mode);
            const saved = it.to.meta?.leg;
            if (meta && this.onRouted && (!saved || saved.from !== meta.from || saved.via !== meta.via || saved.s !== meta.s || saved.m !== meta.m || saved.line !== meta.line)) this.onRouted(it.to.line, meta);
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
}

/** Flights and boats have no router; everything else goes to Google Routes. */
export function routable(mode: Transport): boolean {
  return mode !== "flight" && mode !== "boat";
}

function googleMode(mode: Transport): "TRANSIT" | "WALK" | "DRIVE" | "BICYCLE" {
  if (TRANSIT_MODES.has(mode)) return "TRANSIT";
  if (mode === "walk") return "WALK";
  if (mode === "bike") return "BICYCLE";
  return "DRIVE";
}

/** Departure for a transit query: the day's date with the stop's written time, else undefined. */
export function departureFor(dayDate: Date | null, from: Stop): Date | undefined {
  if (!dayDate || !from.time) return undefined;
  const [h, m] = from.time.split(":").map(Number);
  const d = new Date(dayDate);
  d.setHours(h, m, 0, 0);
  return d;
}

/**
 * The calendar date of a day heading, or null when the heading has no full
 * date or spans a range (then the weekday is unknown, so nothing is checked).
 */
export function dateForDay(day: { date: { year: number; month: number; day: number } | null; dateEnd?: { year: number; month: number; day: number } | null }): Date | null {
  return day.date && !day.dateEnd ? new Date(day.date.year, day.date.month - 1, day.date.day) : null;
}
