import { describe, expect, it } from "vitest";
import { parseItinerary } from "./itinerary";
import { nextStop, previousStop, readProgress, resolveStop, stopRef } from "./journey";

const text = "## 2026-09-16\n- [Hotel](geo:35,139)\n- [Temple](geo:35.1,139.1)\n- [Hotel](geo:35,139)\n## 2026-09-17\n- [Station](geo:35.2,139.2)";

describe("manual trip progress", () => {
  it("restores a repeated visit after lines are inserted", () => {
    const trip = parseItinerary(text);
    const saved = JSON.stringify({ current: stopRef(trip, trip.stops[2]), finished: false });
    const edited = parseItinerary("Introduction\n\n" + text);
    expect(resolveStop(edited, readProgress(JSON.parse(saved)).current)).toBe(edited.stops[2]);
  });

  it("requires re-selection when a saved visit is removed or becomes ambiguous", () => {
    const trip = parseItinerary(text), ref = stopRef(trip, trip.stops[2]);
    expect(resolveStop(parseItinerary(text.replace("- [Hotel](geo:35,139)\n", "")), ref)).toBeNull();
    expect(resolveStop(parseItinerary(text + "\n## 2026-09-16\n- [Hotel](geo:35,139)"), ref)).toBeNull();
    expect(resolveStop(parseItinerary(text.replace(/Hotel/g, "Inn")), ref)).toBeNull();
  });

  it("advances in note order across dates and stops at the last stop", () => {
    const trip = parseItinerary(text);
    expect(nextStop(trip, trip.stops[2])).toBe(trip.stops[3]);
    expect(nextStop(trip, trip.stops[3])).toBeNull();
    expect(nextStop(trip, { ...trip.stops[0] })).toBeNull();
  });

  it("returns to the previous stop across dates and stops at the first", () => {
    const trip = parseItinerary(text);
    expect(previousStop(trip, trip.stops[3])).toBe(trip.stops[2]);
    expect(previousStop(trip, trip.stops[1])).toBe(trip.stops[0]);
    expect(previousStop(trip, trip.stops[0])).toBeNull();
    expect(previousStop(trip, { ...trip.stops[1] })).toBeNull();
  });

  it("does not restore corrupt or out-of-range references", () => {
    const trip = parseItinerary(text), ref = stopRef(trip, trip.stops[0]);
    for (const raw of [null, {}, { current: { ...ref, lat: 91 } }, { current: { ...ref, occurrence: -1 } }, { current: { ...ref, dayCount: 0 } }]) {
      expect(readProgress(raw)).toEqual({ current: null, finished: false });
    }
    expect(readProgress({ current: ref, finished: true })).toEqual({ current: ref, finished: true });
  });
});
