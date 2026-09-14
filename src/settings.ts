import { googlePlaces, googleRoute } from "./net";
import { Notice, PluginSettingTab, Setting, type App } from "obsidian";
import type WayfarerPlugin from "./main";

export interface WayfarerSettings {
  /** Google API key with Places API (New) and Routes API enabled. Without it: pins from the link only, no routes, no photos. */
  googleApiKey: string;
  /** BCP-47 language for place names and hours from Google, e.g. zh-TW, ja, en. */
  languageCode: string;
  /** Interface language: "auto" follows Obsidian. */
  uiLanguage: "auto" | "en" | "zh-TW";
  /** Width of the timeline column in pixels. */
  listWidth: number;
  /** Whether the timeline column is shown beside the map. */
  listOpen: boolean;
  /** Headings at this level or shallower start a new day. */
  dayHeadingLevel: number;
  /** Convert Google Maps links automatically on paste. */
  convertOnPaste: boolean;
  /** Prefix converted stops with a category emoji (⛩️ 🍜 🏨 ...). */
  addEmoji: boolean;
  /** The map flies to the stop on the cursor line. */
  followCursor: boolean;
  /** Raster tile URL template. */
  tileUrl: string;
  tileAttribution: string;
  /** Draw a line through each day's stops in order. */
  drawRoutes: boolean;
  /** Open the map pane when a note with stops becomes active. */
  autoOpen: boolean;
}

export const DEFAULT_SETTINGS: WayfarerSettings = {
  googleApiKey: "",
  languageCode: "zh-TW",
  uiLanguage: "auto",
  listWidth: 260,
  listOpen: true,
  dayHeadingLevel: 2,
  convertOnPaste: true,
  addEmoji: true,
  followCursor: true,
  tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  tileAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  drawRoutes: true,
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
      .setName("Map follows the cursor")
      .addToggle((t) => t.setValue(s.followCursor).onChange((v) => { s.followCursor = v; save(); }));

    new Setting(containerEl)
      .setName("Open the map when a note has places")
      .addToggle((t) => t.setValue(s.autoOpen).onChange((v) => { s.autoOpen = v; save(); }));

    new Setting(containerEl).setName("Google").setHeading();
    const keyDesc = document.createDocumentFragment();
    keyDesc.append("Your own key. It unlocks exact pins with ratings, opening hours and photos, and routes between stops (walking, cycling, driving and transit with line names). Without it the plugin still reads pins from pasted links, and legs show their distance only. Stored in this vault's plugin data, never in a note. ");
    const how = document.createElement("a");
    how.href = "https://github.com/kevinsslin/wayfarer#google-api-key";
    how.textContent = "How to get one";
    keyDesc.append(how, ".");
    new Setting(containerEl)
      .setName("Google API key")
      .setDesc(keyDesc)
      .addText((t) => {
        t.inputEl.type = "password";
        t.setPlaceholder("AIza...").setValue(s.googleApiKey).onChange((v) => { s.googleApiKey = v.trim(); save(); });
      })
      .addButton((b) => {
        b.setButtonText("Test key").onClick(async () => {
          if (!s.googleApiKey) { new Notice("Wayfarer: paste a key first"); return; }
          b.setDisabled(true);
          const out: string[] = [];
          try {
            const p = await googlePlaces(s.googleApiKey, s.languageCode).searchText("Tokyo Station");
            out.push(p ? `Places OK (${p.name})` : "Places: no result");
          } catch (e) {
            out.push(`Places refused: ${(e as Error).message}`);
          }
          try {
            const r = await googleRoute(s.googleApiKey, s.languageCode, { lat: 35.6812, lng: 139.7671 }, { lat: 35.7101, lng: 139.8107 }, "WALK");
            out.push(r ? `Routes OK (${Math.round(r.distanceM / 100) / 10} km)` : "Routes: no result");
          } catch (e) {
            out.push(`Routes refused: ${(e as Error).message}`);
          }
          b.setDisabled(false);
          new Notice(`Wayfarer key test\n${out.join("\n")}`, 20000);
        });
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
