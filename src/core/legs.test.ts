import { beforeAll, describe, expect, it } from "vitest";
import { setLocale } from "./i18n";
import { parseItinerary } from "./itinerary";
import { bareLeg, coordKey, decodePolyline, finishLeg, formatDuration, haversineM, legMetaFor, legText, minutesOf, shortWayLng } from "./legs";

beforeAll(() => setLocale("zh-TW"));

const it2 = parseItinerary(`## 9/17
1. 07:53 [湯滝](geo:36.7938,139.4316)
2. 08:10 🚶 [赤沼](geo:36.7754,139.4432)
3. [中禪寺湖](geo:36.7345,139.4823) %%wf:{"via":"bus"}%%
4. [福岡機場](geo:33.5859,130.4507)
`);
const [yudaki, akanuma, chuzenji, fuk] = it2.stops;

describe("legs", () => {
  it("measures distance", () => {
    expect(Math.round(haversineM(yudaki, akanuma) / 100)).toBe(23);
  });
  it("knows the mode only when the user said so", () => {
    expect(bareLeg(yudaki, akanuma).mode).toBe("walk");
    expect(akanuma.emoji).toBeUndefined();
    expect(bareLeg(akanuma, chuzenji).mode).toBe("bus");
    expect(bareLeg(chuzenji, fuk).mode).toBeUndefined();
  });
  it("has no duration and no lateness until routed", () => {
    const leg = bareLeg(yudaki, akanuma);
    expect(leg.durationS).toBeUndefined();
    expect(leg.lateBy).toBe(0);
    const routed = finishLeg({ ...leg, durationS: 34 * 60, routed: true, source: "google" });
    expect(routed.lateBy).toBe(17);
  });
  it("formats", () => {
    expect(minutesOf("07:53")).toBe(473);
    expect(minutesOf(undefined)).toBeNull();
    expect(formatDuration(59 * 60)).toBe("59 分");
    expect(formatDuration(125 * 60)).toBe("2 時 5 分");
    expect(legText(bareLeg(yudaki, akanuma))).toBe("2.3 km");
  });
  it("uses a saved route only for the same previous stop and mode", () => {
    const saved = parseItinerary(`## 2026-09-17
1. [湯滝](geo:36.7938,139.4316)
2. [赤沼](geo:36.7754,139.4432) %%wf:{"via":"bus","leg":{"from":"36.7938,139.4316","via":"bus","s":900,"m":4100,"line":"日光 2 號"}}%%
3. [中禪寺湖](geo:36.7345,139.4823) %%wf:{"via":"bus","leg":{"from":"0,0","via":"bus","s":900,"m":4100}}%%
`).stops;
    const ok = bareLeg(saved[0], saved[1]);
    expect(ok).toMatchObject({ routed: true, durationS: 900, distanceM: 4100, summary: "日光 2 號", source: "google" });
    const stale = bareLeg(saved[1], saved[2]);
    expect(stale.routed).toBe(false);
    expect(stale.durationS).toBeUndefined();
    expect(legMetaFor(saved[0], { durationS: 899.6, distanceM: 4100.4, summary: "X" }, "bus")).toEqual({ from: coordKey(saved[0]), via: "bus", s: 900, m: 4100, line: "X" });
    expect(legMetaFor(saved[0], { durationS: undefined, distanceM: 1 }, "bus")).toBeNull();
  });
  it("decodes a polyline", () => {
    const pts = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(pts).toEqual([[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]);
  });
});

describe("shortWayLng", () => {
  it("crosses the antimeridian when that is shorter", () => {
    expect(shortWayLng(139.77, -122.38)).toBeCloseTo(237.62);
    expect(shortWayLng(-122.38, 139.77)).toBeCloseTo(-220.23);
    expect(shortWayLng(121.55, 139.77)).toBe(139.77);
  });
});
