/** Google content can follow the user's language even when the map UI has no translation for it. */
export function googleLanguageFor(preference: string | undefined, uiLanguage: string, obsidianLanguage: string | null | undefined): string {
  const requested = preference?.trim();
  const code = requested && requested.toLowerCase() !== "auto"
    ? requested
    : uiLanguage === "auto" ? obsidianLanguage : uiLanguage;
  if (!code) return "en";
  try {
    const locale = new Intl.Locale(code.trim().replace(/_/g, "-"));
    // Obsidian uses "zh" for Simplified Chinese; Google accepts explicit script variants.
    if (locale.language === "zh") {
      return locale.script === "Hant" || ["TW", "HK", "MO"].includes(locale.region ?? "") ? "zh-TW" : "zh-CN";
    }
    return locale.baseName;
  } catch {
    return "en";
  }
}
