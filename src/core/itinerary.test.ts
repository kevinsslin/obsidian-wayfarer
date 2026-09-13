import { describe, expect, it } from "vitest";
import { dayAtLine, dayLabel, formatStop, parseItinerary, patchLineMeta } from "./itinerary";

const NOTE = `---
locations:
---
# 日本 2026

[羽田](geo:35.5494,139.7798) 先到

## 9/16 週三 日光市區

搭 19:19 的車。
- [東武日光站](geo:36.7509,139.6187) tag:d1
- [日光ステーションホテル](geo:36.7512,139.6201) tag:d1 tag:stay %%wf:{"rating":4.1,"hours":["Monday: Open 24 hours"]}%%

## 9/17 週四 上山

\`\`\`
[not a stop](geo:1,2)
\`\`\`
1. [湯滝](geo:36.7938,139.4316)
2. [赤沼](geo:36.7754,139.4432) 然後 [中禪寺湖](geo:36.7358,139.4685)

### 補充（三級標題不分天）
[華嚴瀑布](geo:36.7383,139.5031)

## 沒有地點的一天
只有文字。
`;

describe("parseItinerary", () => {
  const it_ = parseItinerary(NOTE);

  it("groups stops under ## headings and keeps document order", () => {
    expect(it_.days.map((d) => d.title)).toEqual(["", "9/16 週三 日光市區", "9/17 週四 上山"]);
    expect(it_.days[1].stops.map((s) => s.name)).toEqual(["東武日光站", "日光ステーションホテル"]);
    expect(it_.days[2].stops.map((s) => s.name)).toEqual(["湯滝", "赤沼", "中禪寺湖", "華嚴瀑布"]);
  });
  it("drops days without stops and numbers the remaining ones", () => {
    expect(it_.days.map((d) => d.index)).toEqual([0, 1, 2]);
    expect(it_.stops.map((s) => s.dayIndex)).toEqual([0, 1, 1, 2, 2, 2, 2]);
    expect(it_.days[2].stops.map((s) => s.index)).toEqual([0, 1, 2, 3]);
  });
  it("skips fenced code and frontmatter", () => {
    expect(it_.stops.some((s) => s.name === "not a stop")).toBe(false);
  });
  it("parses tags and metadata", () => {
    const hotel = it_.days[1].stops[1];
    expect(hotel.tags).toEqual(["d1", "stay"]);
    expect(hotel.meta).toEqual({ rating: 4.1, hours: ["Monday: Open 24 hours"] });
    expect(it_.days[1].stops[0].meta).toBeUndefined();
  });
  it("records positions so the map can jump back into the note", () => {
    const akanuma = it_.days[2].stops[1];
    const lines = NOTE.split("\n");
    expect(lines[akanuma.line].slice(akanuma.from, akanuma.to)).toBe("[赤沼](geo:36.7754,139.4432)");
  });
  it("labels days from dates in the heading", () => {
    expect(it_.days[1].label).toBe("9/16");
    expect(it_.days[0].label).toBe("");
  });
  it("maps a cursor line to its day", () => {
    const lines = NOTE.split("\n");
    const line = lines.findIndex((l) => l.includes("搭 19:19"));
    expect(dayAtLine(it_, line)).toBe(1);
    expect(dayAtLine(it_, lines.findIndex((l) => l.includes("華嚴")))).toBe(2);
    expect(dayAtLine(it_, lines.findIndex((l) => l.includes("只有文字")))).toBe(-1);
  });
  it("honours a different heading level", () => {
    const one = parseItinerary(NOTE, { maxHeadingLevel: 1 });
    expect(one.days.length).toBe(1);
    expect(one.days[0].stops.length).toBe(7);
  });
});

describe("dayLabel", () => {
  it("handles the common date spellings", () => {
    expect(dayLabel("2026-09-17 Thu")).toBe("9/17");
    expect(dayLabel("9月17日 上山")).toBe("9/17");
    expect(dayLabel("Sep 17, hike")).toBe("9/17");
    expect(dayLabel("Day 3: Kyoto")).toBe("D3");
    expect(dayLabel("Arrival")).toBe("Arrival");
  });
});

describe("formatStop", () => {
  it("round-trips through the parser", () => {
    const text = formatStop("千光寺 [本堂]", 34.40891234567, 133.20445678, ["d3"], { rating: 4.55, hours: ["Mon: 9–17"], website: "https://x" });
    expect(text).toBe('[千光寺 本堂](geo:34.408912,133.204457) tag:d3 %%wf:{"rating":4.6,"hours":["Mon: 9–17"],"website":"https://x"}%%');
    const parsed = parseItinerary(text);
    expect(parsed.stops[0]).toMatchObject({ name: "千光寺 本堂", lat: 34.408912, lng: 133.204457, tags: ["d3"] });
    expect(parsed.stops[0].meta?.rating).toBe(4.6);
  });
  it("omits empty metadata", () => {
    expect(formatStop("A", 1, 2, [], {})).toBe("[A](geo:1,2)");
  });
});

describe("meta placement and day headings", () => {
  it("reads meta anywhere after the link and patches it", () => {
    const it2 = parseItinerary(`## 9/17\n- 走到 [赤沼](geo:1,2) 備註 %%wf:{"via":"bus"}%%`);
    const st = it2.stops[0];
    expect(st.transport).toBe("bus");
    const patched = patchLineMeta(`- [赤沼](geo:1,2) tag:stay 備註`, { via: "walk" });
    expect(patched).toBe(`- [赤沼](geo:1,2) tag:stay %%wf:{"via":"walk"}%% 備註`);
    expect(patchLineMeta(patched, { via: undefined })).toBe(`- [赤沼](geo:1,2) tag:stay 備註`);
    expect(patchLineMeta(`- [赤沼](geo:1,2) %%wf:{"rating":4.4}%%`, { via: "train" })).toBe(`- [赤沼](geo:1,2) %%wf:{"rating":4.4,"via":"train"}%%`);
  });
  it("treats only the configured level as days when it exists", () => {
    const it2 = parseItinerary(`# Trip\n[A](geo:1,1)\n## 9/16\n[B](geo:2,2)\n## 9/17\n[C](geo:3,3)`);
    expect(it2.days.map((d) => d.title)).toEqual(["", "9/16", "9/17"]);
    const single = parseItinerary(`# 9/16\n[B](geo:2,2)\n# 9/17\n[C](geo:3,3)`);
    expect(single.days.map((d) => d.title)).toEqual(["9/16", "9/17"]);
  });
});

describe("continuation lines", () => {
  it("collects indented lines under a stop as its notes, skipping image-only lines", () => {
    const it2 = parseItinerary(`## 9/27
- 🚌 [中洲屋台](geo:33.5930,130.4062) 晚上才熱鬧
    上船前先買玉米
    ![[nakasu.jpg]]
    - 船 40 分一班
- [根津神社](geo:35.7203,139.7610)`);
    const [yatai, nezu] = it2.stops;
    expect(yatai.notes).toEqual(["上船前先買玉米", "船 40 分一班"]);
    expect(yatai.image).toBe("nakasu.jpg");
    expect(yatai.transport).toBe("bus");
    expect(yatai.emoji).toBeUndefined();
    expect(nezu.notes).toEqual([]);
  });
});
