import { beforeAll, describe, expect, it } from "vitest";
import { setLocale } from "./i18n";
beforeAll(() => setLocale("zh-TW"));
import { checkHours, fmtMin, parseDayHours } from "./schedule";

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
    expect(checkHours(hours, 1, undefined)).toBeNull();
  });
  it("formats minutes", () => {
    expect(fmtMin(605)).toBe("10:05");
  });
});
