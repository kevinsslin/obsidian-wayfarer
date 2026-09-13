import { describe, expect, it } from "vitest";
import { dayAtLine, dayDateEnd, dayLabel, formatStop, parseItinerary, patchLineMeta, setTransportOnLine } from "./itinerary";

const NOTE = `---
locations:
---
# 日本 2026

[羽田](geo:35.5494,139.7798) 先到

## 9/16 週三 日光市區

搭 19:19 的車。
- [東武日光站](geo:36.7509,139.6187)
- [日光ステーションホテル](geo:36.7512,139.6201) %%wf:{"rating":4.1,"hours":["Monday: Open 24 hours"]}%%

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
  it("parses metadata", () => {
    const hotel = it_.days[1].stops[1];
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
  it("labels a range heading with both ends", () => {
    expect(dayLabel("2026-09-19 ~ 2026-09-26 東京")).toBe("9/19~9/26");
    expect(dayLabel("2026-09-19～2026-09-26")).toBe("9/19~9/26");
    expect(dayLabel("2026-09-19 to 2026-09-26")).toBe("9/19~9/26");
  });
});

describe("dayDateEnd", () => {
  it("reads the end of a range and rejects a backwards or missing one", () => {
    expect(dayDateEnd("2026-09-19 ~ 2026-09-26 東京")).toEqual({ year: 2026, month: 9, day: 26 });
    expect(dayDateEnd("2026-09-19 到 2026-10-02")).toEqual({ year: 2026, month: 10, day: 2 });
    expect(dayDateEnd("2026-09-26 ~ 2026-09-19")).toBeNull();
    expect(dayDateEnd("2026-09-19 週六")).toBeNull();
    expect(dayDateEnd("2026-09-19 ~ 2026-02-30")).toBeNull();
  });
  it("a range is one block whose weekday is unknown", () => {
    const it = parseItinerary("## 2026-09-19 ~ 2026-09-26 東京\n- [A](geo:35.68,139.76)\n");
    expect(it.days[0].date).toEqual({ year: 2026, month: 9, day: 19 });
    expect(it.days[0].dateEnd).toEqual({ year: 2026, month: 9, day: 26 });
    expect(it.days[0].label).toBe("9/19~9/26");
  });
  it("only a full date is a date", () => {
    expect(parseItinerary("## 2026-09-17 週四\n- [A](geo:1,2)").days[0].date).toEqual({ year: 2026, month: 9, day: 17 });
    expect(parseItinerary("## 9/17 週四\n- [A](geo:1,2)").days[0].date).toBeNull();
    expect(parseItinerary("## 2026-02-30\n- [A](geo:1,2)").days[0].date).toBeNull();
  });
});

describe("formatStop", () => {
  it("round-trips through the parser", () => {
    const text = formatStop("千光寺 [本堂]", 34.40891234567, 133.20445678, { rating: 4.55, hours: ["Mon: 9–17"], website: "https://x" });
    expect(text).toBe('[千光寺 本堂](geo:34.408912,133.204457) %%wf:{"rating":4.6,"hours":["Mon: 9–17"],"website":"https://x"}%%');
    const parsed = parseItinerary(text);
    expect(parsed.stops[0]).toMatchObject({ name: "千光寺 本堂", lat: 34.408912, lng: 133.204457 });
    expect(parsed.stops[0].meta?.rating).toBe(4.6);
  });
  it("omits empty metadata", () => {
    expect(formatStop("A", 1, 2, {})).toBe("[A](geo:1,2)");
  });
});

describe("meta placement and day headings", () => {
  it("reads meta anywhere after the link and patches it", () => {
    const it2 = parseItinerary(`## 9/17\n- 走到 [赤沼](geo:1,2) 備註 %%wf:{"via":"bus"}%%`);
    const st = it2.stops[0];
    expect(st.transport).toBe("bus");
    const patched = patchLineMeta(`- [赤沼](geo:1,2) 備註`, { via: "walk" });
    expect(patched).toBe(`- [赤沼](geo:1,2) %%wf:{"via":"walk"}%% 備註`);
    expect(patchLineMeta(patched, { via: undefined })).toBe(`- [赤沼](geo:1,2) 備註`);
    expect(patchLineMeta(`    - [赤沼](geo:1,2)  兩個空格 %%wf:{"via":"bus"}%%`, { via: "walk" })).toBe(`    - [赤沼](geo:1,2)  兩個空格 %%wf:{"via":"walk"}%%`);
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

describe("setTransportOnLine", () => {
  const stopOf = (md: string, i = 0) => parseItinerary(`## 2026-09-17\n${md}\n`).days[0].stops[i];
  it("replaces the transport emoji already before the link", () => {
    const line = "- 12:52 🚌 [中禅寺温泉](geo:36.7389,139.4995) 下山";
    expect(setTransportOnLine(line, stopOf(line), "walk")).toBe("- 12:52 🚶 [中禅寺温泉](geo:36.7389,139.4995) 下山");
  });
  it("inserts one before the link when there is none and keeps a category emoji", () => {
    const line = "- ⛩️ [根津神社](geo:35.72,139.7607) 例大祭";
    expect(setTransportOnLine(line, stopOf(line), "metro")).toBe("- ⛩️ 🚇 [根津神社](geo:35.72,139.7607) 例大祭");
  });
  it("only touches the segment before its own link", () => {
    const line = "- 🚆 [A](geo:1,2) 到 🚌 [B](geo:3,4)";
    expect(setTransportOnLine(line, stopOf(line, 1), "taxi")).toBe("- 🚆 [A](geo:1,2) 到 🚕 [B](geo:3,4)");
  });
  it("drops a legacy via so the text is the only source", () => {
    const line = `- [A](geo:1,2) %%wf:{"via":"bus","rating":4.1}%%`;
    expect(setTransportOnLine(line, stopOf(line), "walk")).toBe(`- 🚶 [A](geo:1,2) %%wf:{"rating":4.1}%%`);
  });
  it("drops a route saved for another mode and keeps one for the same mode", () => {
    const line = `- 🚌 [A](geo:1,2) %%wf:{"leg":{"from":"1.0000,2.0000","via":"bus","s":600,"m":3000}}%%`;
    expect(setTransportOnLine(line, stopOf(line), "walk")).toBe("- 🚶 [A](geo:1,2)");
    expect(setTransportOnLine(line, stopOf(line), "bus")).toBe(line);
  });
  it("the emoji wins over an older via when both are present", () => {
    expect(stopOf(`- 🚶 [A](geo:1,2) %%wf:{"via":"bus"}%%`).transport).toBe("walk");
  });
});

describe("undated sections beside dated days", () => {
  it("are notes, not days on the map", () => {
    const md = "## 2026-09-17 上山\n- [A](geo:1,2)\n## 候選\n- [B](geo:3,4)\n## 待辦\n- [ ] 訂房\n";
    const it = parseItinerary(md);
    expect(it.days.map((d) => d.title)).toEqual(["2026-09-17 上山"]);
    expect(it.stops.map((s) => s.name)).toEqual(["A"]);
  });
  it("stay days when the note has no dates at all", () => {
    const it = parseItinerary("## Day 1\n- [A](geo:1,2)\n## Day 2\n- [B](geo:3,4)\n");
    expect(it.days.length).toBe(2);
  });
});
