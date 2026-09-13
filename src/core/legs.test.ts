import { beforeAll, describe, expect, it } from "vitest";
import { setLocale } from "./i18n";
beforeAll(() => setLocale("zh-TW"));
import { parseItinerary } from "./itinerary";
import { decodePolyline, estimateLeg, formatDuration, haversineM, legMode, minutesOf } from "./legs";

const it2 = parseItinerary(`## 9/17
1. 07:53 巴士到 [湯滝](geo:36.7938,139.4316)
2. 08:10 走木道到 [赤沼](geo:36.7754,139.4432)
3. [中禪寺湖](geo:36.7345,139.4823)
4. 下午 飛 [福岡機場](geo:33.5859,130.4507)
`);
const [yudaki, akanuma, chuzenji, fuk] = it2.stops;

describe("legs", () => {
  it("measures distance", () => {
    expect(Math.round(haversineM(yudaki, akanuma) / 100)).toBe(23);
  });
  it("uses the written transport, else walk for short hops and train beyond", () => {
    expect(legMode(akanuma, 2300)).toBe("walk");
    expect(legMode(chuzenji, 800)).toBe("walk");
    expect(legMode(chuzenji, 5000)).toBe("train");
    expect(legMode(fuk, 900_000)).toBe("flight");
  });
  it("flags a leg that cannot fit between the written times", () => {
    const leg = estimateLeg(yudaki, akanuma);
    expect(leg.mode).toBe("walk");
    expect(leg.durationS).toBeGreaterThan(17 * 60);
    expect(leg.lateBy).toBeGreaterThan(0);
  });
  it("formats and parses times", () => {
    expect(minutesOf("07:53")).toBe(473);
    expect(minutesOf(undefined)).toBeNull();
    expect(formatDuration(59 * 60)).toBe("59 分");
    expect(formatDuration(125 * 60)).toBe("2 時 5 分");
  });
  it("decodes a polyline", () => {
    const pts = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(pts).toEqual([[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]);
  });
});
