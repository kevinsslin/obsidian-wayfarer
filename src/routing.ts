import { TRANSIT_MODES, type Transport } from "./core/category";
import type { Day, Stop } from "./core/itinerary";
import { bareLeg, finishLeg, legKey, legMetaFor, type Leg } from "./core/legs";
import type { LegMeta } from "./core/itinerary";
import { GoogleApiError, googleRoute } from "./net";
import type { WayfarerSettings } from "./settings";

/**
 * Turns a day's stops into legs. Answers synchronously with what is known
 * (distance, and cached routes), then asks Google Routes for legs whose mode
 * the user has chosen and calls `onUpdate` once per batch so the pane
 * redraws. Without a Google key nothing is fetched: a leg is its distance.
 */
export class LegRouter {
  /** `null` remembers that Google had no route for the leg, so it is not asked again this session. */
  private cache = new Map<string, Pick<Leg, "distanceM" | "durationS" | "geometry" | "summary" | "source"> | null>();
  private inflight = new Set<string>();
  /** After a refusal or a network failure nothing is asked until this time, so a bad key does not cost a request per redraw. */
  private pausedUntil = 0;
  private pausedKey = "";
  /** Cache hits already offered to a note, so a stop whose line cannot take the write is not retried on every redraw. */
  private written = new Set<string>();

  /**
   * `onRouted` receives the destination stop and what to save on it, so the
   * numbers travel with the note.
   */
  constructor(
    private settings: () => WayfarerSettings,
    private onUpdate: () => void,
    private onRouted?: (to: Stop, leg: LegMeta, file: string) => void,
    private onError?: (e: GoogleApiError) => void,
  ) {}

  /** `file` is the note the day came from, so a result that arrives after the user moved on is not written elsewhere. */
  legsFor(day: Day, dayDate: Date | null, file = ""): Leg[] {
    const legs: Leg[] = [];
    const missing: Array<{ from: Stop; to: Stop; mode: Transport; key: string; departure?: Date; file: string }> = [];
    for (let i = 1; i < day.stops.length; i++) {
      const from = day.stops[i - 1];
      const to = day.stops[i];
      const leg = bareLeg(from, to);
      // A leg already saved on the stop is not asked again: the numbers are there, and every call counts against the key.
      // A saved leg that already carries its shape is complete; one saved without a shape (older notes) is asked once more.
      if ((leg.routed && to.meta?.leg?.p) || !leg.mode || !routable(leg.mode) || !this.settings().googleApiKey) {
        legs.push(leg);
        continue;
      }
      const key = legKey(from, to, leg.mode);
      const hit = this.cache.get(key);
      if (hit) {
        legs.push(finishLeg({ ...leg, ...hit, routed: true }));
        // A route known from another note or an earlier stop is worth saving here too, once.
        const meta = legMetaFor(from, hit, leg.mode);
        if (meta && this.onRouted && !sameLeg(to.meta?.leg, meta) && !this.written.has(`${file}:${to.line}:${key}`)) {
          this.written.add(`${file}:${to.line}:${key}`);
          this.onRouted(to, meta, file);
        }
      } else {
        legs.push(leg);
        if (hit === undefined && !this.inflight.has(key)) missing.push({ from, to, mode: leg.mode, key, departure: departureFor(dayDate, from, to), file });
      }
    }
    if (missing.length && !this.paused()) void this.fetch(missing);
    return legs;
  }

  private paused(): boolean {
    const key = this.settings().googleApiKey;
    // A new key lifts the pause at once.
    if (key !== this.pausedKey) { this.pausedKey = key; this.pausedUntil = 0; }
    return Date.now() < this.pausedUntil;
  }

  private pause(ms: number): void {
    this.pausedKey = this.settings().googleApiKey;
    this.pausedUntil = Math.max(this.pausedUntil, Date.now() + ms);
  }

  private async fetch(items: Array<{ from: Stop; to: Stop; mode: Transport; key: string; departure?: Date; file: string }>): Promise<void> {
    for (const it of items) this.inflight.add(it.key);
    let changed = false;
    await Promise.all(
      items.map(async (it) => {
        try {
          const s = this.settings();
          const r = await googleRoute(s.googleApiKey, s.languageCode, it.from, it.to, googleMode(it.mode), it.departure);
          this.cache.set(it.key, r ? { ...r, source: "google" } : null);
          if (r) {
            changed = true;
            const meta = legMetaFor(it.from, r, it.mode);
            const saved = it.to.meta?.leg;
            if (meta && this.onRouted && !sameLeg(saved, meta)) this.onRouted(it.to, meta, it.file);
          }
        } catch (e) {
          // The leg keeps its distance only. A refusal is told once and stops further asking for a while;
          // a network failure pauses briefly so an offline session does not retry on every redraw.
          if (e instanceof GoogleApiError) {
            this.pause(e.status === 429 ? 60_000 : 10 * 60_000);
            this.onError?.(e);
          } else this.pause(30_000);
        } finally {
          this.inflight.delete(it.key);
        }
      }),
    );
    if (changed) this.onUpdate();
  }
}

function sameLeg(a: LegMeta | undefined, b: LegMeta): boolean {
  return !!a && a.from === b.from && a.via === b.via && a.s === b.s && a.m === b.m && a.line === b.line && a.p === b.p;
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

/**
 * Departure for a transit query: the day's date with the stop's written time,
 * else undefined. A written time is local to the place, so the instant is
 * built with the place's UTC offset (from Google details on either end of the
 * leg, else a guess from the longitude), never the computer's zone.
 */
export function departureFor(dayDate: Date | null, from: Stop, to?: Stop): Date | undefined {
  if (!dayDate || !from.time) return undefined;
  const [h, m] = from.time.split(":").map(Number);
  const offset = from.meta?.utc ?? to?.meta?.utc ?? Math.round(from.lng / 15) * 60;
  return new Date(Date.UTC(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), h, m) - offset * 60_000);
}

/**
 * The calendar date of a day heading, or null when the heading has no full
 * date or spans a range (then the weekday is unknown, so nothing is checked).
 */
export function dateForDay(day: { date: { year: number; month: number; day: number } | null; dateEnd?: { year: number; month: number; day: number } | null }): Date | null {
  return day.date && !day.dateEnd ? new Date(day.date.year, day.date.month - 1, day.date.day) : null;
}
