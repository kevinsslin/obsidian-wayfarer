import { beforeAll, describe, expect, it } from "vitest";
import { setLocale } from "./i18n";
import { parseItinerary } from "./itinerary";
import { bareLeg, decodePolyline, finishLeg, formatDuration, haversineM, legText, minutesOf } from "./legs";

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
  it("decodes a polyline", () => {
    const pts = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(pts).toEqual([[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]);
  });
});
