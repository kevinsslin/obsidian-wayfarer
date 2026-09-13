import type { Stop } from "./itinerary";

/** Google Maps search URL for one point. Opens the place picker on phone and web. */
export function placeUrl(stop: Pick<Stop, "lat" | "lng">): string {
  return `https://www.google.com/maps/search/?api=1&query=${stop.lat},${stop.lng}`;
}

/**
 * Directions through a day's stops in order. Google caps waypoints at 9 on the
 * URL API, so a longer day keeps the first, last and an even spread between.
 */
export function directionsUrl(stops: Pick<Stop, "lat" | "lng">[], mode: "transit" | "walking" | "driving" = "transit"): string | null {
  if (stops.length === 0) return null;
  if (stops.length === 1) return placeUrl(stops[0]);
  const pt = (s: Pick<Stop, "lat" | "lng">) => `${s.lat},${s.lng}`;
  const middle = stops.slice(1, -1);
  const kept = middle.length <= 9 ? middle : Array.from({ length: 9 }, (_, i) => middle[Math.round((i * (middle.length - 1)) / 8)]);
  const params = new URLSearchParams({ api: "1", origin: pt(stops[0]), destination: pt(stops[stops.length - 1]), travelmode: mode });
  if (kept.length) params.set("waypoints", kept.map(pt).join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Day headings for a trip, one per day, e.g. "## 9/16 週三". */
export function tripSkeleton(start: Date, days: number, weekdayNames = ["日", "一", "二", "三", "四", "五", "六"], level = 2): string {
  const out: string[] = ["---", "locations:", "---", ""];
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    out.push(`${"#".repeat(level)} ${d.getMonth() + 1}/${d.getDate()} 週${weekdayNames[d.getDay()]}`, "", "- ", "");
  }
  return out.join("\n");
}
