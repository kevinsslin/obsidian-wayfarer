/** One colour per day. Picked to stay legible on OSM tiles in both themes. */
export const DAY_COLORS = [
  "#1F4E6B", // 藍色
  "#9A3B22", // 弁柄
  "#2F6446", // 千歳緑
  "#7B3F8C", // 紫
  "#B8860B", // 山吹
  "#136F6D", // 鴨の羽
  "#C0392B", // 緋
  "#4A5A8A", // 藤
];

export function dayColor(index: number): string {
  return DAY_COLORS[((index % DAY_COLORS.length) + DAY_COLORS.length) % DAY_COLORS.length];
}
