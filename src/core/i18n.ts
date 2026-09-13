/**
 * UI strings. The locale follows Obsidian's language unless the user picks
 * one in settings. Core formatting (durations, trailers) reads the same
 * table so text written into notes matches the interface.
 */
export type Locale = "en" | "zh-TW";

const TABLE = {
  en: {
    all: "All", follow_on: "Map follows the cursor (click to stop)", follow_off: "Map stays put (click to follow the cursor)",
    min: "{n} min", hours: "{h} h", hours_min: "{h} h {m} min",
    from_prev: "from {name}", approx: "about ", late_by: "{n} min late", late_vs: "{n} min after {t}",
    open_gmaps: "Google Maps ↗", from_prev_dir: "from previous stop ↗", website: "Website ↗", to_line: "Go to line",
    closed_day: "closed that day", opens_at: "opens {t}", closed_at: "closed at {t}", empty: "No stops in this note yet. Paste a Google Maps link under a day heading.",
    day: "Day {n}", other: "Other", via_hint: "Click to change how you get there", pick_mode: "how do you get there?",
    m_walk: "walk", m_bike: "bike", m_car: "car", m_taxi: "taxi", m_bus: "bus", m_train: "train", m_metro: "metro / MRT", m_tram: "tram / light rail", m_boat: "boat / ferry", m_flight: "flight",
    list_hide: "Hide the timeline", list_show: "Show the timeline", notes_more: "Show notes", notes_less: "Hide notes", key_needed: "add a Google key for the route",
    kml_written: "Wrote {f}. In Google My Maps: Create a new map → Import → pick this file. Re-export replaces it; delete the old layer there.",
  },
  "zh-TW": {
    all: "全部", follow_on: "地圖跟著游標（點一下停止）", follow_off: "地圖不動（點一下開始跟隨）",
    min: "{n} 分", hours: "{h} 時", hours_min: "{h} 時 {m} 分",
    from_prev: "從 {name}", approx: "約 ", late_by: "晚到 {n} 分", late_vs: "比 {t} 晚 {n} 分",
    open_gmaps: "Google Maps ↗", from_prev_dir: "從上一站導航 ↗", website: "網站 ↗", to_line: "到這行",
    closed_day: "當天休", opens_at: "{t} 才開", closed_at: "{t} 已關", empty: "這份筆記還沒有地點。在某一天的標題下貼一個 Google Maps 連結。",
    day: "第 {n} 天", other: "其他", via_hint: "點一下換交通方式", pick_mode: "怎麼去？",
    m_walk: "走路", m_bike: "單車", m_car: "開車", m_taxi: "計程車", m_bus: "巴士", m_train: "火車 / 新幹線", m_metro: "地鐵 / 捷運", m_tram: "路面電車 / 輕軌", m_boat: "船", m_flight: "飛機",
    list_hide: "收起時間軸", list_show: "展開時間軸", notes_more: "展開補充", notes_less: "收起補充", key_needed: "填 Google key 才有路線",
    kml_written: "已寫入 {f}。到 Google My Maps：建立新地圖 → 匯入 → 選這個檔。重新匯出會整份重產，舊圖層請在那邊刪掉。",
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
  return "en";
}

export function t(key: StringKey, vars: Record<string, string | number> = {}): string {
  let s: string = TABLE[current][key] ?? TABLE.en[key];
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}
