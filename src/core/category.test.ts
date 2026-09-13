import { describe, expect, it } from "vitest";
import { categoryFromGoogleType, categoryFromName, firstEmoji, pickCategory, transportFrom } from "./category";

describe("firstEmoji", () => {
  it("finds emoji and ignores digits", () => {
    expect(firstEmoji("- 07:53 🚌 到 [湯滝](geo:1,2)")).toBe("🚌");
    expect(firstEmoji("1. 09:00 no emoji #tag")).toBeNull();
    expect(firstEmoji("⛩️ 根津神社")).toBe("⛩️");
  });
});

describe("category", () => {
  it("prefers tags, then google type, then name", () => {
    expect(pickCategory({ tags: ["stay"], googleType: "restaurant", name: "神社" })).toBe("stay");
    expect(pickCategory({ tags: [], googleType: "japanese_restaurant", name: "神社" })).toBe("food");
    expect(pickCategory({ tags: [], name: "根津神社" })).toBe("shrine");
    expect(pickCategory({ tags: [], name: "somewhere" })).toBe("place");
  });
  it("maps names in three languages", () => {
    expect(categoryFromName("日光ステーションホテル")).toBe("stay");
    expect(categoryFromName("東武日光站")).toBe("station");
    expect(categoryFromName("湯滝")).toBe("nature");
    expect(categoryFromName("千光寺")).toBe("temple");
    expect(categoryFromName("中禪寺湖")).toBe("nature");
    expect(categoryFromName("中洲屋台")).toBe("food");
    expect(categoryFromName("福岡機場")).toBe("airport");
    expect(categoryFromName("Artizon Museum")).toBe("museum");
    expect(categoryFromName("Ichiran Ramen")).toBe("food");
  });
  it("maps google primary types", () => {
    expect(categoryFromGoogleType("shinto_shrine")).toBe("shrine");
    expect(categoryFromGoogleType("coffee_shop")).toBe("cafe");
    expect(categoryFromGoogleType("train_station")).toBe("station");
    expect(categoryFromGoogleType(undefined)).toBeNull();
  });
});

describe("transportFrom", () => {
  it("reads the mode from the words before a link", () => {
    expect(transportFrom("07:53 巴士到 ")).toBe("bus");
    expect(transportFrom("走木道到 ")).toBe("walk");
    expect(transportFrom("11:55 スペーシアX 4 號 ")).toBe("train");
    expect(transportFrom("下午 飛 ")).toBe("flight");
    expect(transportFrom("看宮神輿 ")).toBeNull();
  });
});
