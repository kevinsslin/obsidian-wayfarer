import { beforeAll, describe, expect, it } from "vitest";
import { setLocale } from "./i18n";
beforeAll(() => setLocale("zh-TW"));
import { parseItinerary } from "./itinerary";
import { estimateLeg } from "./legs";
import { buildSchedule, checkHours, fmtMin, parseDayHours, parseDwell, splitTrailer } from "./schedule";

describe("parseDwell", () => {
  it("reads hours and minutes forms", () => {
    expect(parseDwell("[赤沼](geo:1,2) ~1h45")).toBe(105);
    expect(parseDwell("走走 ~2h")).toBe(120);
    expect(parseDwell("[x](geo:1,2) ~45m 吃飯")).toBe(45);
    expect(parseDwell("~30分")).toBe(30);
    expect(parseDwell("no dwell here ~ish")).toBeUndefined();
  });
});

describe("buildSchedule", () => {
  const it2 = parseItinerary(`## 9/17
1. 07:53 巴士到 [湯滝](geo:36.7938,139.4316) ~20m
2. 走木道到 [赤沼](geo:36.7754,139.4432) ~1h45
3. 12:52 巴士到 [中禪寺湖](geo:36.7345,139.4823)
4. [華嚴瀑布](geo:36.7383,139.5031)
5. [湯元溫泉](geo:36.7955,139.4247)
`);
  const day = it2.days[0];
  const legs = day.stops.slice(1).map((st, i) => estimateLeg(day.stops[i], st));
  const slots = buildSchedule(day, legs);
  it("anchors on written times and infers the rest", () => {
    expect(slots[0].arrive).toBe(7 * 60 + 53);
    expect(slots[0].depart).toBe(8 * 60 + 13);
    expect(slots[1].inferred).toBe(true);
    expect(slots[1].arrive).toBe(slots[0].depart! + Math.round(legs[0].durationS / 60));
    expect(slots[1].depart).toBe(slots[1].arrive! + 105);
    expect(slots[2].inferred).toBe(false);
    expect(slots[2].arrive).toBe(12 * 60 + 52);
  });
  it("stops inferring where the stay is unknown", () => {
    // 中禪寺湖 has a written time but no stay, so nothing after it can be placed
    expect(slots[2].depart).toBeUndefined();
    expect(slots[3].arrive).toBeUndefined();
    expect(slots[3].inferred).toBe(false);
    expect(slots[4].arrive).toBeUndefined();
  });
  it("reports lateness against a written anchor", () => {
    const predicted = slots[1].depart! + Math.round(legs[1].durationS / 60);
    expect(slots[2].lateBy).toBe(Math.max(0, predicted - (12 * 60 + 52)));
  });
});

describe("hours", () => {
  it("parses english and chinese lines", () => {
    expect(parseDayHours("Monday: 9:00 AM – 5:00 PM").ranges).toEqual([[540, 1020]]);
    expect(parseDayHours("星期一: 09:00 – 17:00, 18:00 – 22:00").ranges).toEqual([[540, 1020], [1080, 1320]]);
    expect(parseDayHours("Tuesday: Closed").closed).toBe(true);
    expect(parseDayHours("星期三: 24 小時營業").allDay).toBe(true);
    expect(parseDayHours("Friday: 6:00 PM – 2:00 AM").ranges).toEqual([[1080, 1560]]);
  });
  it("checks arrivals", () => {
    const hours = ["Monday: 9:00 AM – 5:00 PM", "Tuesday: Closed", "Wednesday: 9:00 AM – 5:00 PM", "Thursday: 9:00 AM – 5:00 PM", "Friday: 9:00 AM – 5:00 PM", "Saturday: 9:00 AM – 5:00 PM", "Sunday: 9:00 AM – 5:00 PM"];
    expect(checkHours(hours, 2, 600)).toEqual({ kind: "closed-day" });
    expect(checkHours(hours, 1, 600)).toEqual({ kind: "ok" });
    expect(checkHours(hours, 1, 480)).toEqual({ kind: "not-open-yet", opensAt: 540 });
    expect(checkHours(hours, 1, 1100)).toEqual({ kind: "already-closed", closedAt: 1020 });
    expect(checkHours(hours, 1, 960, 90)).toEqual({ kind: "closes-soon", closedAt: 1020 });
    expect(checkHours(hours, 1, undefined)).toBeNull();
  });
  it("formats minutes", () => {
    expect(fmtMin(605)).toBe("10:05");
  });
});

describe("splitTrailer", () => {
  it("separates the written leg trailer", () => {
    const r = splitTrailer("- 走木道到 [赤沼](geo:1,2) ~1h45 · 🚶 34 分 · 2.5 km · ≈10:05 到");
    expect(r.base).toBe("- 走木道到 [赤沼](geo:1,2) ~1h45");
    expect(r.trailer).toBe(" · 🚶 34 分 · 2.5 km · ≈10:05 到");
    expect(splitTrailer("- plain [x](geo:1,2)").trailer).toBe("");
  });
});
