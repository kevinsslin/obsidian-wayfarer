import { PluginSettingTab, Setting, type App } from "obsidian";
import type WayfarerPlugin from "./main";

export interface WayfarerSettings {
  /** Google Places (New) API key. Optional; without it links resolve from their own coordinates or OSM. */
  googleApiKey: string;
  /** BCP-47 language for place names and hours from Google, e.g. zh-TW, ja, en. */
  languageCode: string;
  /** Interface language: "auto" follows Obsidian. */
  uiLanguage: "auto" | "en" | "zh-TW";
  /** Width of the timeline column in pixels. */
  listWidth: number;
  /** Headings at this level or shallower start a new day. */
  dayHeadingLevel: number;
  /** Convert Google Maps links automatically on paste. */
  convertOnPaste: boolean;
  /** Prefix converted stops with a category emoji (⛩️ 🍜 🏨 ...). */
  addEmoji: boolean;
  /** Look up a photo for every stop from Wikipedia and Wikimedia Commons; Google when a key is set. */
  autoPhotos: boolean;
  /** The map flies to the stop on the cursor line. */
  followCursor: boolean;
  /** Raster tile URL template. */
  tileUrl: string;
  tileAttribution: string;
  /** Draw a line through each day's stops in order. */
  drawRoutes: boolean;
  /** Fetch real routes between stops (OSRM for walking and driving, Google Routes for transit when a key is set). */
  routeLegs: boolean;
  /** With a Google key, use Google Routes for walking and driving too. */
  preferGoogleRoutes: boolean;
  /** Open the map pane when a note with stops becomes active. */
  autoOpen: boolean;
}

export const DEFAULT_SETTINGS: WayfarerSettings = {
  googleApiKey: "",
  languageCode: "zh-TW",
  uiLanguage: "auto",
  listWidth: 260,
  dayHeadingLevel: 2,
  convertOnPaste: true,
  addEmoji: true,
  followCursor: true,
  autoPhotos: true,
  tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  tileAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  drawRoutes: true,
  routeLegs: true,
  preferGoogleRoutes: false,
  autoOpen: true,
};

export class WayfarerSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: WayfarerPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;
    const save = () => void this.plugin.saveSettings();

    new Setting(containerEl)
      .setName("Language")
      .addDropdown((d) => {
        d.addOption("auto", "Follow Obsidian").addOption("en", "English").addOption("zh-TW", "繁體中文");
        d.setValue(s.uiLanguage).onChange((v) => { s.uiLanguage = v as WayfarerSettings["uiLanguage"]; save(); this.plugin.applyLocale(); this.plugin.refresh(); });
      });

    new Setting(containerEl)
      .setName("Convert Google Maps links when pasted")
      .setDesc("A pasted link (including maps.app.goo.gl) becomes a place with a pin.")
      .addToggle((t) => t.setValue(s.convertOnPaste).onChange((v) => { s.convertOnPaste = v; save(); }));

    new Setting(containerEl)
      .setName("Add an emoji to converted places")
      .setDesc("⛩️ 🍜 🏨 🚉 based on what the place is. An emoji you typed before the link is kept.")
      .addToggle((t) => t.setValue(s.addEmoji).onChange((v) => { s.addEmoji = v; save(); }));

    new Setting(containerEl)
      .setName("Find photos automatically")
      .setDesc("From Wikipedia and Wikimedia Commons. No key needed.")
      .addToggle((t) => t.setValue(s.autoPhotos).onChange((v) => { s.autoPhotos = v; save(); this.plugin.refresh(); }));

    new Setting(containerEl)
      .setName("Map follows the cursor")
      .addToggle((t) => t.setValue(s.followCursor).onChange((v) => { s.followCursor = v; save(); }));

    new Setting(containerEl)
      .setName("Open the map when a note has places")
      .addToggle((t) => t.setValue(s.autoOpen).onChange((v) => { s.autoOpen = v; save(); }));

    new Setting(containerEl).setName("Google").setHeading();
    new Setting(containerEl)
      .setName("Google API key")
      .setDesc("Optional. Adds ratings, opening hours, Google's own photos, and real transit routes with line names. Places API (New) and Routes API must be enabled on the key. Stored only in this vault's plugin data.")
      .addText((t) => {
        t.inputEl.type = "password";
        t.setPlaceholder("AIza...").setValue(s.googleApiKey).onChange((v) => { s.googleApiKey = v.trim(); save(); });
      });
    new Setting(containerEl)
      .setName("Language for Google results")
      .setDesc("Place names and opening hours, e.g. zh-TW, ja, en.")
      .addText((t) => t.setValue(s.languageCode).onChange((v) => { s.languageCode = v.trim() || "en"; save(); }));

    new Setting(containerEl).setName("Advanced").setHeading();
    new Setting(containerEl)
      .setName("Heading level that starts a day")
      .setDesc("Default ## . If the note has none at this level, larger headings count.")
      .addDropdown((d) => {
        for (const n of [1, 2, 3, 4]) d.addOption(String(n), "#".repeat(n));
        d.setValue(String(s.dayHeadingLevel)).onChange((v) => { s.dayHeadingLevel = Number(v); save(); this.plugin.refresh(); });
      });
    new Setting(containerEl)
      .setName("Route between places")
      .setDesc("Walking and driving via OpenStreetMap (OSRM). Transit via Google when a key is set, otherwise estimated from distance.")
      .addToggle((t) => t.setValue(s.routeLegs).onChange((v) => { s.routeLegs = v; save(); this.plugin.refresh(); }));
    new Setting(containerEl)
      .setName("Use Google for walking and driving too")
      .setDesc("Needs a key. Better where OpenStreetMap is thin.")
      .addToggle((t) => t.setValue(s.preferGoogleRoutes).onChange((v) => { s.preferGoogleRoutes = v; save(); this.plugin.refresh(); }));
    new Setting(containerEl)
      .setName("Draw lines between places")
      .addToggle((t) => t.setValue(s.drawRoutes).onChange((v) => { s.drawRoutes = v; save(); this.plugin.refresh(); }));
    new Setting(containerEl)
      .setName("Map tiles URL")
      .addText((t) => t.setValue(s.tileUrl).onChange((v) => { s.tileUrl = v.trim() || DEFAULT_SETTINGS.tileUrl; save(); this.plugin.refresh(); }));
    new Setting(containerEl)
      .setName("Map tiles attribution")
      .addText((t) => t.setValue(s.tileAttribution).onChange((v) => { s.tileAttribution = v; save(); this.plugin.refresh(); }));
  }
}
