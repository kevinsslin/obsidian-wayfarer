/** Insets are relative to the map pane, not to the whole phone screen. */
export interface Rect { top: number; bottom: number; left: number; right: number }

export function mapClearance(root: Rect, headers: Rect[], footers: Rect[], viewport: Rect, safeBottom = 0): { top: number; bottom: number } {
  const intersects = (r: Rect) => r.right > root.left && r.left < root.right && r.bottom > root.top && r.top < root.bottom;
  const top = Math.max(0, viewport.top - root.top, ...headers.filter(intersects).map((r) => r.bottom - root.top));
  const bottom = Math.max(0, root.bottom - viewport.bottom + safeBottom, ...footers.filter(intersects).map((r) => root.bottom - r.top));
  return { top, bottom };
}
