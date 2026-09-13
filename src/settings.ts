import { PluginSettingTab, Setting, type App } from "obsidian";
import type ItineraryMapPlugin from "./main";

export interface ItineraryMapSettings {
  /** Google Places (New) API key. Optional; without it links resolve from their own coordinates or OSM. */
  googleApiKey: string;
  /** BCP-47 language for place names and hours from Google, e.g. zh-TW, ja, en. */
  languageCode: string;
  /** Headings at this level or shallower start a new day. */
  dayHeadingLevel: number;
  /** Convert Google Maps links automatically on paste. */
  convertOnPaste: boolean;
  /** Add `tag:d<n>` to converted stops using the day's position. */
  addDayTag: boolean;
  /** Raster tile URL template. */
  tileUrl: string;
  tileAttribution: string;
  /** Draw a line through each day's stops in order. */
  drawRoutes: boolean;
  /** Open the map pane when a note with stops becomes active. */
  autoOpen: boolean;
}

export const DEFAULT_SETTINGS: ItineraryMapSettings = {
  googleApiKey: "",
  languageCode: "zh-TW",
  dayHeadingLevel: 2,
  convertOnPaste: true,
  addDayTag: false,
  tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  tileAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  drawRoutes: true,
  autoOpen: true,
};

export class ItineraryMapSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: ItineraryMapPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;
    const save = () => void this.plugin.saveSettings();

    new Setting(containerEl)
      .setName("Convert Google Maps links on paste")
      .setDesc("Pasting a Google Maps link (including maps.app.goo.gl) turns it into [Name](geo:lat,lng).")
      .addToggle((t) => t.setValue(s.convertOnPaste).onChange((v) => { s.convertOnPaste = v; save(); }));

    new Setting(containerEl)
      .setName("Day heading level")
      .setDesc("Headings at this level or higher start a new day. 2 means ## headings.")
      .addDropdown((d) => {
        for (const n of [1, 2, 3, 4]) d.addOption(String(n), "#".repeat(n));
        d.setValue(String(s.dayHeadingLevel)).onChange((v) => { s.dayHeadingLevel = Number(v); save(); this.plugin.refresh(); });
      });

    new Setting(containerEl)
      .setName("Tag converted stops with their day")
      .setDesc("Appends tag:d1, tag:d2 ... so Map View display rules can colour them too.")
      .addToggle((t) => t.setValue(s.addDayTag).onChange((v) => { s.addDayTag = v; save(); }));

    new Setting(containerEl)
      .setName("Draw a line through each day")
      .addToggle((t) => t.setValue(s.drawRoutes).onChange((v) => { s.drawRoutes = v; save(); this.plugin.refresh(); }));

    new Setting(containerEl)
      .setName("Open the map automatically")
      .setDesc("When a note with stops becomes active and the map pane is closed.")
      .addToggle((t) => t.setValue(s.autoOpen).onChange((v) => { s.autoOpen = v; save(); }));

    new Setting(containerEl).setName("Google Places").setHeading();

    new Setting(containerEl)
      .setName("Google Places API key")
      .setDesc("Optional. With a key, pasted links get the exact pin, canonical name, rating and opening hours. Stored in this vault's plugin data, never in the note.")
      .addText((t) => {
        t.inputEl.type = "password";
        t.setPlaceholder("AIza...").setValue(s.googleApiKey).onChange((v) => { s.googleApiKey = v.trim(); save(); });
      });

    new Setting(containerEl)
      .setName("Language for place names")
      .setDesc("BCP-47 code sent to Google, e.g. zh-TW, ja, en.")
      .addText((t) => t.setValue(s.languageCode).onChange((v) => { s.languageCode = v.trim() || "en"; save(); }));

    new Setting(containerEl).setName("Map tiles").setHeading();

    new Setting(containerEl)
      .setName("Tile URL template")
      .addText((t) => t.setValue(s.tileUrl).onChange((v) => { s.tileUrl = v.trim() || DEFAULT_SETTINGS.tileUrl; save(); this.plugin.refresh(); }));

    new Setting(containerEl)
      .setName("Tile attribution")
      .addText((t) => t.setValue(s.tileAttribution).onChange((v) => { s.tileAttribution = v; save(); this.plugin.refresh(); }));
  }
}
