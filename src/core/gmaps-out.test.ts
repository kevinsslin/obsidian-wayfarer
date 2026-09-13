import { describe, expect, it } from "vitest";
import { directionsUrl, placeUrl, tripSkeleton } from "./gmaps-out";

describe("directionsUrl", () => {
  it("returns null for no stops and a place link for one", () => {
    expect(directionsUrl([])).toBeNull();
    expect(directionsUrl([{ lat: 1, lng: 2 }])).toBe(placeUrl({ lat: 1, lng: 2 }));
  });
  it("puts middle stops as waypoints in order", () => {
    const u = new URL(directionsUrl([{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, { lat: 3, lng: 3 }, { lat: 4, lng: 4 }])!);
    expect(u.searchParams.get("origin")).toBe("1,1");
    expect(u.searchParams.get("destination")).toBe("4,4");
    expect(u.searchParams.get("waypoints")).toBe("2,2|3,3");
    expect(u.searchParams.get("travelmode")).toBe("transit");
  });
  it("caps waypoints at 9 keeping the endpoints", () => {
    const stops = Array.from({ length: 20 }, (_, i) => ({ lat: i, lng: i }));
    const u = new URL(directionsUrl(stops)!);
    const wp = u.searchParams.get("waypoints")!.split("|");
    expect(wp).toHaveLength(9);
    expect(wp[0]).toBe("1,1");
    expect(wp[8]).toBe("18,18");
  });
});

describe("tripSkeleton", () => {
  it("writes one heading per day with weekday", () => {
    const s = tripSkeleton(new Date(2026, 8, 16), 3);
    expect(s).toContain("## 2026-09-16 週三");
    expect(s).toContain("## 2026-09-17 週四");
    expect(s).toContain("## 2026-09-18 週五");
    expect(s.startsWith("---\nlocations:\n---")).toBe(true);
  });
  it("crosses a month boundary", () => {
    expect(tripSkeleton(new Date(2026, 8, 30), 2)).toContain("## 2026-10-01 週四");
  });
});
