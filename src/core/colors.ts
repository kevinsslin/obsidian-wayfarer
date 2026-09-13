/**
 * One colour per day. Mid-tone, slightly muted, so they read on OSM tiles in
 * both themes and sit well together on the timeline: lake, terracotta, jade,
 * wisteria, saffron, teal, rose, slate.
 */
export const DAY_COLORS = ["#3A6EA5", "#C2603E", "#3F8F6B", "#8A5AA6", "#D29B2C", "#2E8B8B", "#C74B5D", "#6B7A99"];

export function dayColor(index: number): string {
  return DAY_COLORS[((index % DAY_COLORS.length) + DAY_COLORS.length) % DAY_COLORS.length];
}
