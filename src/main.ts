import { MarkdownView, Notice, Platform, Plugin, TFile, debounce, type Editor, type MarkdownFileInfo, type WorkspaceLeaf } from "obsidian";
import { isGoogleMapsUrl } from "./core/gmaps-url";
import { dayAtLine, parseItinerary, patchLineMeta, type Itinerary, type PlaceMeta } from "./core/itinerary";
import { ResolveError, resolveMapsUrl, type ResolveDeps } from "./core/resolve";
import { expandShortUrl, googlePlaces, nominatim } from "./net";
import { DEFAULT_SETTINGS, WayfarerSettingTab, type WayfarerSettings } from "./settings";
import { findMapsUrl, metaDecorations, replaceUrlInEditor, stopText } from "./ui/editor";
import { WayfarerView, VIEW_TYPE_WAYFARER } from "./ui/map-view";
import { readingPostProcessor } from "./ui/reading";
import { NewTripModal } from "./ui/new-trip-modal";
import { tripSkeleton } from "./core/gmaps-out";
import { firstEmoji } from "./core/category";
import { LegRouter } from "./routing";
import { PhotoFinder } from "./photos";
import type { FoundPhoto } from "./net";
import { localeFor, setLocale } from "./core/i18n";

/**
 * Wayfarer: the note is the plan, the pane is the map.
 *
 * `src/core` is Obsidian-free and unit tested. This file wires it to the
 * editor (paste conversion, cursor tracking), the map view, and settings.
 */
export default class WayfarerPlugin extends Plugin {
  settings: WayfarerSettings = { ...DEFAULT_SETTINGS };
  private views = new Set<WayfarerView>();
  readonly router = new LegRouter(() => this.settings, () => { for (const v of this.views) v.redraw(); });
  private photoCache: Record<string, FoundPhoto | null> = {};
  readonly photos = new PhotoFinder(
    () => this.settings,
    this.photoCache,
    () => { for (const v of this.views) v.redraw(); },
    debounce(() => void this.saveSettings(), 2000, true),
    (link) => {
      const from = this.current?.file.path ?? "";
      const f = this.app.metadataCache.getFirstLinkpathDest(link, from);
      return f ? this.app.vault.getResourcePath(f) : null;
    },
  );
  private current: { file: TFile; itinerary: Itinerary } | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.applyLocale();
    this.addSettingTab(new WayfarerSettingTab(this.app, this));

    this.registerView(VIEW_TYPE_WAYFARER, (leaf) => new WayfarerView(leaf, this));
    this.registerEditorExtension(metaDecorations);
    this.registerMarkdownPostProcessor(readingPostProcessor);

    this.addRibbonIcon("map", "Open itinerary map", () => void this.openMap());
    this.addCommand({ id: "open-map", name: "Open itinerary map", callback: () => void this.openMap() });
    this.addCommand({
      id: "convert-maps-link",
      name: "Convert Google Maps link on this line to a stop",
      editorCheckCallback: (checking, editor) => {
        const line = editor.getCursor().line;
        const found = findMapsUrl(editor.getLine(line));
        if (!found) return false;
        if (!checking) void this.convert(editor, line, found.url);
        return true;
      },
    });
    this.addCommand({
      id: "new-trip",
      name: "Insert day headings for a trip",
      editorCallback: (editor) =>
        new NewTripModal(this.app, (start, days) => {
          const skeleton = tripSkeleton(start, days, undefined, this.settings.dayHeadingLevel);
          // A blank note takes the frontmatter too; a note with content only gets the headings.
          const text = editor.getValue().trim() ? skeleton.replace(/^---\nlocations:\n---\n\n/, "") : skeleton;
          editor.replaceSelection(text);
        }).open(),
    });
    this.addCommand({
      id: "convert-all-maps-links",
      name: "Convert every Google Maps link in this note",
      editorCallback: (editor) => void this.convertAll(editor),
    });

    this.registerEvent(this.app.workspace.on("editor-paste", (evt, editor) => this.onPaste(evt, editor)));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.refresh()));
    this.registerEvent(this.app.workspace.on("editor-change", debounce((editor: Editor, info: MarkdownFileInfo) => this.onEdit(editor, info), 250, true)));
    this.registerEvent(this.app.metadataCache.on("changed", (file) => { if (file.path === this.current?.file.path) this.refresh(); }));
    this.registerDomEvent(document, "selectionchange", () => this.trackCursor());
    this.registerDomEvent(document, "keyup", () => this.trackCursor());
    this.registerDomEvent(document, "mouseup", () => this.trackCursor());

    this.app.workspace.onLayoutReady(() => this.refresh());
  }

  onunload(): void {
    this.views.clear();
  }

  /* ---------- settings ---------- */

  applyLocale(): void {
    let code: string | null = this.settings.uiLanguage;
    if (code === "auto") {
      try { code = window.localStorage?.getItem("language") ?? null; } catch { code = null; }
    }
    setLocale(localeFor(code));
  }

  async loadSettings(): Promise<void> {
    const data = ((await this.loadData()) ?? {}) as Partial<WayfarerSettings> & { photoCache?: Record<string, FoundPhoto | null> };
    const { photoCache, ...rest } = data;
    this.settings = { ...DEFAULT_SETTINGS, ...rest };
    if (photoCache) Object.assign(this.photoCache, photoCache);
  }
  async saveSettings(): Promise<void> {
    // keep the cache bounded; newest entries are at the end of insertion order
    const keys = Object.keys(this.photoCache);
    for (const k of keys.slice(0, Math.max(0, keys.length - 400))) delete this.photoCache[k];
    await this.saveData({ ...this.settings, photoCache: this.photoCache });
  }

  /* ---------- map pane ---------- */

  attachView(v: WayfarerView): void {
    this.views.add(v);
    this.refresh();
  }
  detachView(v: WayfarerView): void {
    this.views.delete(v);
  }

  async openMap(): Promise<void> {
    const existing = this.mapLeaf();
    if (existing) {
      await this.app.workspace.revealLeaf(existing);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: VIEW_TYPE_WAYFARER, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  /**
   * The pane holding our view. Checked by saved view state, not live type,
   * because right after a plugin reload the leaf is still a placeholder that
   * `getLeavesOfType` does not return, and opening another would stack panes.
   */
  private mapLeaf(): WorkspaceLeaf | null {
    let found: WorkspaceLeaf | null = null;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (!found && leaf.getViewState().type === VIEW_TYPE_WAYFARER) found = leaf;
    });
    return found;
  }

  /** Re-parses the active markdown note and pushes it to every map pane. */
  refresh(): void {
    const md = this.activeMarkdown();
    if (!md?.file) {
      // Keep showing the last note while the user is in the map pane or settings.
      if (this.current) this.pushToViews();
      return;
    }
    const itinerary = parseItinerary(md.editor.getValue(), { maxHeadingLevel: this.settings.dayHeadingLevel });
    this.current = { file: md.file, itinerary };
    for (const v of this.views) v.applyTiles();
    this.pushToViews();
    if (this.settings.autoOpen && itinerary.stops.length > 0 && this.views.size === 0 && !Platform.isMobile) this.autoOpenSoon();
  }

  /**
   * Obsidian restores a plugin's saved panes shortly after the plugin loads,
   * so opening one immediately at startup or reload would leave two. Wait a
   * moment and open only if no pane has appeared.
   */
  private autoOpenTimer: number | null = null;
  private autoOpenSoon(): void {
    if (this.autoOpenTimer !== null) return;
    this.autoOpenTimer = window.setTimeout(() => {
      this.autoOpenTimer = null;
      if (this.views.size === 0 && !this.mapLeaf()) void this.openMap();
    }, 600);
  }

  private pushToViews(): void {
    if (!this.current) return;
    const md = this.activeMarkdown();
    const day = md?.file?.path === this.current.file.path ? dayAtLine(this.current.itinerary, md.editor.getCursor().line) : -1;
    for (const v of this.views) v.render(this.current.file, this.current.itinerary, day);
  }

  private onEdit(editor: Editor, info: MarkdownFileInfo): void {
    if (!info.file) return;
    this.current = { file: info.file, itinerary: parseItinerary(editor.getValue(), { maxHeadingLevel: this.settings.dayHeadingLevel }) };
    this.pushToViews();
  }

  private trackCursor(): void {
    if (this.views.size === 0 || !this.current) return;
    const md = this.activeMarkdown();
    if (!md?.file || md.file.path !== this.current.file.path) return;
    const line = md.editor.getCursor().line;
    const day = dayAtLine(this.current.itinerary, line);
    for (const v of this.views) v.onCursor(line, day);
  }

  /**
   * The note the map should show: the active markdown view, or, when the
   * active leaf is the map pane itself (as it is right after startup or a
   * click on the map), the most recently used markdown leaf.
   */
  private activeMarkdown(): MarkdownView | null {
    const active = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (active) return active;
    const recent = this.app.workspace.getMostRecentLeaf();
    if (recent?.view instanceof MarkdownView) return recent.view;
    const first = this.app.workspace.getLeavesOfType("markdown")[0];
    return first?.view instanceof MarkdownView ? first.view : null;
  }

  /* ---------- state chosen on the map ---------- */

  /** Merges `patch` into the `%%wf:{}%%` comment of the stop on `line`. */
  setStopMeta(line: number, patch: Partial<PlaceMeta>): void {
    const md = this.activeMarkdown();
    if (!md) return;
    const text = md.editor.getLine(line);
    const next = patchLineMeta(text, patch);
    if (next !== text) md.editor.replaceRange(next, { line, ch: 0 }, { line, ch: text.length });
    this.refresh();
  }

  /** Moves the stop line at `from` to sit where `to` is (before it when moving up, after it when moving down). */
  async moveStopLine(from: number, to: number): Promise<void> {
    const md = this.activeMarkdown();
    if (!md) return;
    const editor = md.editor;
    // The stop's block: its line plus every deeper-indented line under it (notes, images).
    const indentOf = (l: string) => /^\s*/.exec(l)![0].replace(/\t/g, "    ").length;
    const takeWith = (ln: number): number => {
      const base = indentOf(editor.getLine(ln));
      let n = 1;
      while (ln + n < editor.lineCount()) {
        const l = editor.getLine(ln + n);
        if (!l.trim() || indentOf(l) <= base) break;
        n++;
      }
      return n;
    };
    const count = takeWith(from);
    const lines = Array.from({ length: count }, (_, i) => editor.getLine(from + i));
    const total = editor.lineCount();
    const endLine = from + count;
    const removeTo = endLine < total ? { line: endLine, ch: 0 } : { line: from + count - 1, ch: editor.getLine(from + count - 1).length };
    const removeFrom = endLine < total ? { line: from, ch: 0 } : { line: from - 1, ch: editor.getLine(from - 1).length };
    editor.replaceRange("", removeFrom, removeTo);
    let target = to;
    if (from < to) target = to - count + takeWith(to - count);
    else target = to;
    const insertAt = Math.min(target, editor.lineCount());
    const text = lines.join("\n") + "\n";
    if (insertAt >= editor.lineCount()) editor.replaceRange("\n" + lines.join("\n"), { line: editor.lineCount() - 1, ch: editor.getLine(editor.lineCount() - 1).length });
    else editor.replaceRange(text, { line: insertAt, ch: 0 });
    editor.setCursor({ line: insertAt, ch: 0 });
    this.refresh();
  }

  /* ---------- paste conversion ---------- */

  private onPaste(evt: ClipboardEvent, editor: Editor): void {
    if (!this.settings.convertOnPaste || evt.defaultPrevented) return;
    const text = evt.clipboardData?.getData("text/plain")?.trim() ?? "";
    if (!text || /\s/.test(text) || !isGoogleMapsUrl(text)) return;
    evt.preventDefault();
    // Insert the URL right away so typing is never blocked, then swap it once resolved.
    const cursor = editor.getCursor();
    editor.replaceSelection(text);
    void this.convert(editor, cursor.line, text);
  }

  private resolveDeps(): ResolveDeps {
    return {
      expandShortUrl: Platform.isDesktopApp ? expandShortUrl : undefined,
      places: this.settings.googleApiKey ? googlePlaces(this.settings.googleApiKey, this.settings.languageCode) : undefined,
      nominatim,
    };
  }

  private async convert(editor: Editor, line: number, url: string): Promise<void> {
    try {
      const place = await resolveMapsUrl(url, this.resolveDeps());
      const lineText = editor.getLine(line);
      const hasEmoji = firstEmoji(lineText.slice(0, Math.max(0, lineText.indexOf(url)))) !== null;
      if (!replaceUrlInEditor(editor, line, url, stopText(place, this.settings.addEmoji && !hasEmoji))) {
        new Notice(`Wayfarer: the link moved before it resolved. ${place.name} is at ${place.lat}, ${place.lng}.`);
      }
    } catch (e) {
      const msg = e instanceof ResolveError ? e.message : `Could not resolve the link (${(e as Error).message ?? e})`;
      new Notice(`Wayfarer: ${msg}`, 8000);
    }
  }

  private async convertAll(editor: Editor): Promise<void> {
    let n = 0;
    for (let line = 0; line < editor.lineCount(); line++) {
      const found = findMapsUrl(editor.getLine(line));
      if (!found) continue;
      await this.convert(editor, line, found.url);
      n++;
    }
    new Notice(n ? `Wayfarer: converted ${n} link${n === 1 ? "" : "s"}` : "Wayfarer: no Google Maps links in this note");
  }
}
