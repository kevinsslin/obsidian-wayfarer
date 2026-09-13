// Loads the built main.js against a stub `obsidian` module and drives onload()
// to verify the shipped bundle registers its view, commands, ribbon, settings
// tab, editor extension and post processor without throwing.
//
// Usage: node scripts/load-smoke.mjs [path-to-main.js]   (default: ./main.js)
import Module from "node:module";
import { copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const src = process.argv[2] ?? "main.js";
const cjs = join(mkdtempSync(join(tmpdir(), "wf-smoke-")), "main.cjs");
copyFileSync(src, cjs);

const fakeEl = () => ({
  style: { setProperty() {} },
  createDiv: () => fakeEl(),
  createEl: () => fakeEl(),
  createSpan: () => fakeEl(),
  empty() {},
  addClass() {},
  removeClass() {},
  toggleClass() {},
  setText() {},
  setAttr() {},
  addEventListener() {},
});

class Component {
  register() {}
  registerEvent() {}
  registerDomEvent() {}
  registerInterval() {}
}
class PluginStub extends Component {
  constructor(app, manifest) {
    super();
    this.app = app;
    this.manifest = manifest;
    this.commands = [];
    this.ribbons = [];
    this.views = {};
    this.settingTabs = [];
    this.editorExtensions = [];
    this.postProcessors = [];
  }
  addCommand(c) { this.commands.push(c); return c; }
  addRibbonIcon(icon, title, cb) { this.ribbons.push({ icon, title, cb }); return fakeEl(); }
  registerView(type, factory) { this.views[type] = factory; }
  registerEditorExtension(ext) { this.editorExtensions.push(ext); }
  registerMarkdownPostProcessor(pp) { this.postProcessors.push(pp); }
  addSettingTab(tab) { this.settingTabs.push(tab); }
  async loadData() { return null; }
  async saveData(data) { this.savedData = data; }
}
class ItemViewStub extends Component {
  constructor(leaf) { super(); this.leaf = leaf; this.containerEl = fakeEl(); this.contentEl = fakeEl(); }
}
class PluginSettingTabStub { constructor(app, plugin) { this.app = app; this.plugin = plugin; this.containerEl = fakeEl(); } }
const chain = () => new Proxy(() => chain(), { get: () => chain() });
class SettingStub {
  setName() { return this; } setDesc() { return this; } setHeading() { return this; }
  addToggle(cb) { cb(chain()); return this; } addDropdown(cb) { cb(chain()); return this; } addText(cb) { cb(chain()); return this; }
}

const obsidianStub = {
  Plugin: PluginStub,
  ItemView: ItemViewStub,
  PluginSettingTab: PluginSettingTabStub,
  Setting: SettingStub,
  Notice: class {},
  Modal: class { constructor(app) { this.app = app; this.contentEl = fakeEl(); } setTitle() {} open() {} close() {} },
  MarkdownView: class {},
  TFile: class {},
  Platform: { isMobile: false, isDesktopApp: true },
  WorkspaceLeaf: class {},
  debounce: (fn) => fn,
  requestUrl: async () => ({ status: 500, json: null, text: "" }),
};
const codemirrorStateStub = { RangeSetBuilder: class { add() {} finish() { return {}; } } };
const codemirrorViewStub = {
  Decoration: { replace: () => ({}) },
  EditorView: {},
  ViewPlugin: { fromClass: (cls, spec) => ({ cls, spec }) },
  WidgetType: class {},
};

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "obsidian") return obsidianStub;
  if (request === "@codemirror/state") return codemirrorStateStub;
  if (request === "@codemirror/view") return codemirrorViewStub;
  return origLoad.call(this, request, parent, isMain);
};

// Leaflet touches `window` and `document` at import time.
globalThis.window = globalThis;
globalThis.screen = { deviceXDPI: 96, logicalXDPI: 96 };
globalThis.devicePixelRatio = 1;
globalThis.document = {
  documentElement: { style: {} },
  createElement: () => ({ style: {}, getElementsByTagName: () => [], getContext: () => null }),
  createElementNS: () => ({ style: {} }),
};
Object.defineProperty(globalThis, "navigator", { value: { userAgent: "node", platform: "node", maxTouchPoints: 0 }, configurable: true });
globalThis.ResizeObserver = class { observe() {} disconnect() {} };

const { createRequire } = await import("node:module");
const mod = createRequire(import.meta.url)(cjs);
const PluginClass = mod.default ?? mod;

const app = {
  workspace: {
    on: () => ({}),
    onLayoutReady: (cb) => cb(),
    getActiveViewOfType: () => null,
    getLeavesOfType: () => [],
    getRightLeaf: () => null,
    getMostRecentLeaf: () => null,
    iterateAllLeaves: () => {},
  },
  metadataCache: { on: () => ({}) },
};
const plugin = new PluginClass(app, { id: "wayfarer", version: "0.0.0-smoke" });
await plugin.onload();

const assert = (cond, msg) => { if (!cond) { console.error(`smoke: FAIL ${msg}`); process.exit(1); } };
assert(plugin.views["wayfarer"], "map view registered");
assert(plugin.commands.some((c) => c.id === "open-map"), "open-map command");
assert(plugin.commands.some((c) => c.id === "convert-maps-link"), "convert command");
assert(plugin.commands.some((c) => c.id === "convert-all-maps-links"), "convert-all command");
assert(plugin.commands.some((c) => c.id === "new-trip"), "new-trip command");
assert(plugin.commands.some((c) => c.id === "export-kml"), "export-kml command");
assert(plugin.ribbons.length === 1, "ribbon icon");
assert(plugin.settingTabs.length === 1, "settings tab");
assert(plugin.editorExtensions.length === 1, "editor extension");
assert(plugin.postProcessors.length === 1, "post processor");
assert(plugin.settings.dayHeadingLevel === 2, "default settings loaded");
plugin.onunload();
console.log("smoke: OK (view, 5 commands, ribbon, settings tab, editor extension, post processor)");
