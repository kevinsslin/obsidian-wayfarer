/**
 * UI strings. The locale follows Obsidian's language unless the user picks
 * one in settings. Core formatting (durations, trailers) reads the same
 * table so text written into notes matches the interface.
 */
export type Locale = "en" | "zh-TW" | "ja";

const TABLE = {
  en: {
    all: "All", route: "Route ↗", follow_on: "Map follows the cursor (click to stop)", follow_off: "Map stays put (click to follow the cursor)",
    stops: "{n} stops", moving: "moving {t}", span: "{a} to {b}", late_legs: "{n} legs too tight", hours_issues: "{n} hours issues",
    min: "{n} min", hours: "{h} h", hours_min: "{h} h {m} min", arrive: "arrive", stay: "stay {t}", leave: "leave {t}",
    from_prev: "from {name}", approx: "about ", late_by: "{n} min late", late_vs: "{n} min after {t}",
    src_estimate: "straight-line estimate", src_osrm: "OSRM route", src_google: "Google route",
    open_gmaps: "Google Maps ↗", from_prev_dir: "from previous stop ↗", website: "Website ↗", to_line: "Go to line",
    closed_day: "closed that day", opens_at: "opens {t}", closed_at: "closed at {t}", closes_soon: "closes {t}, not enough time",
    arrive_at: "≈{t} arrive", empty: "No stops in this note yet. Paste a Google Maps link under a day heading.",
    day: "Day {n}", wrote_legs: "Wayfarer: wrote {a} of {b} legs", open_map_first: "Wayfarer: open the map pane first so legs can be routed.",
  },
  "zh-TW": {
    all: "全部", route: "路線 ↗", follow_on: "地圖跟著游標（點一下停止）", follow_off: "地圖不動（點一下開始跟隨）",
    stops: "{n} 站", moving: "移動 {t}", span: "{a} 到 {b}", late_legs: "{n} 段趕不上", hours_issues: "{n} 站營業時間有問題",
    min: "{n} 分", hours: "{h} 時", hours_min: "{h} 時 {m} 分", arrive: "到", stay: "停 {t}", leave: "{t} 走",
    from_prev: "從 {name}", approx: "約 ", late_by: "晚到 {n} 分", late_vs: "比 {t} 晚 {n} 分",
    src_estimate: "直線估算", src_osrm: "OSRM 路線", src_google: "Google 路線",
    open_gmaps: "Google Maps ↗", from_prev_dir: "從上一站導航 ↗", website: "網站 ↗", to_line: "到這行",
    closed_day: "當天休", opens_at: "{t} 才開", closed_at: "{t} 已關", closes_soon: "{t} 關，時間不夠",
    arrive_at: "≈{t} 到", empty: "這份筆記還沒有地點。在某一天的標題下貼一個 Google Maps 連結。",
    day: "第 {n} 天", wrote_legs: "Wayfarer：寫入 {a}/{b} 段交通", open_map_first: "Wayfarer：先打開地圖面板，路線才算得出來。",
  },
  ja: {
    all: "すべて", route: "ルート ↗", follow_on: "地図がカーソルに追従（クリックで停止）", follow_off: "地図は固定（クリックで追従）",
    stops: "{n} 箇所", moving: "移動 {t}", span: "{a} 〜 {b}", late_legs: "{n} 区間が間に合わない", hours_issues: "{n} 箇所の営業時間に注意",
    min: "{n} 分", hours: "{h} 時間", hours_min: "{h} 時間 {m} 分", arrive: "着", stay: "滞在 {t}", leave: "{t} 発",
    from_prev: "{name} から", approx: "約 ", late_by: "{n} 分遅れ", late_vs: "{t} より {n} 分遅れ",
    src_estimate: "直線距離の推定", src_osrm: "OSRM ルート", src_google: "Google ルート",
    open_gmaps: "Google マップ ↗", from_prev_dir: "前の地点から ↗", website: "サイト ↗", to_line: "行へ",
    closed_day: "当日休業", opens_at: "{t} 開店", closed_at: "{t} 閉店済み", closes_soon: "{t} 閉店、時間不足",
    arrive_at: "≈{t} 着", empty: "まだ地点がありません。日付見出しの下に Google マップのリンクを貼ってください。",
    day: "{n} 日目", wrote_legs: "Wayfarer：{b} 区間中 {a} を書き込みました", open_map_first: "Wayfarer：まず地図パネルを開いてください。",
  },
} as const;

export type StringKey = keyof typeof TABLE.en;

let current: Locale = "en";

export function setLocale(l: Locale): void {
  current = l;
}
export function getLocale(): Locale {
  return current;
}

/** Picks the closest supported locale for an Obsidian language code such as "zh-TW", "zh", "ja", "en". */
export function localeFor(code: string | null | undefined): Locale {
  if (!code) return "en";
  if (code.startsWith("zh")) return "zh-TW";
  if (code.startsWith("ja")) return "ja";
  return "en";
}

export function t(key: StringKey, vars: Record<string, string | number> = {}): string {
  let s: string = TABLE[current][key] ?? TABLE.en[key];
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}
