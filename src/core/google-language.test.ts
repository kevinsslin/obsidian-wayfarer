import { describe, expect, it } from "vitest";
import { googleLanguageFor } from "./google-language";

describe("Google content language", () => {
  it.each(["en", "ja", "fr", "de", "ko"])("follows Obsidian %s without limiting it to translated map UI languages", (language) => {
    expect(googleLanguageFor("auto", "auto", language)).toBe(language);
  });

  it("respects the explicit interface language before Obsidian", () => {
    expect(googleLanguageFor("auto", "en", "ja")).toBe("en");
    expect(googleLanguageFor("auto", "zh-TW", "en")).toBe("zh-TW");
  });

  it("keeps an explicit Google override, including the old saved default", () => {
    expect(googleLanguageFor("ja", "en", "en")).toBe("ja");
    expect(googleLanguageFor("zh-TW", "auto", "en")).toBe("zh-TW");
    expect(googleLanguageFor("pt-BR", "en", "en")).toBe("pt-BR");
  });

  it.each([["zh", "zh-CN"], ["zh_CN", "zh-CN"], ["zh-Hant", "zh-TW"], ["zh-HK", "zh-TW"], ["zh-TW", "zh-TW"]])("normalizes Chinese locale %s", (input, expected) => {
    expect(googleLanguageFor("auto", "auto", input)).toBe(expected);
  });

  it("treats blank preferences as automatic and falls back safely when no usable language exists", () => {
    expect(googleLanguageFor(" ", "auto", "ja")).toBe("ja");
    expect(googleLanguageFor(undefined, "auto", null)).toBe("en");
    expect(googleLanguageFor("auto", "auto", "not a locale")).toBe("en");
    expect(googleLanguageFor("en&key=bad", "auto", "en")).toBe("en");
  });
});
