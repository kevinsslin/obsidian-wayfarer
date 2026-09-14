import { describe, expect, it } from "vitest";
import { setLocale, t } from "./i18n";

describe("t", () => {
  it("puts a value with dollar signs through as written", () => {
    setLocale("en");
    expect(t("from_prev", { name: "$$ Ramen $& $' end" })).toBe("from $$ Ramen $& $' end");
    expect(t("day", { n: 3 })).toBe("Day 3");
  });
});
