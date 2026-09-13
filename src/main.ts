import { MarkdownView, Notice, Platform, Plugin, TFile, debounce, type Editor, type MarkdownFileInfo, type WorkspaceLeaf } from "obsidian";
import { isGoogleMapsUrl } from "./core/gmaps-url";
import { dayAtLine, parseItinerary, type Itinerary } from "./core/itinerary";
import { ResolveError, resolveMapsUrl, type ResolveDeps } from "./core/resolve";
import { expandShortUrl, googlePlaces, nominatim } from "./net";
import { DEFAULT_SETTINGS, WayfarerSettingTab, type WayfarerSettings } from "./settings";
import { findMapsUrl, metaDecorations, replaceUrlInEditor, stopText } from "./ui/editor";
import { WayfarerView, VIEW_TYPE_WAYFARER } from "./ui/map-view";
import { readingPostProcessor } from "./ui/reading";
import { NewTripModal } from "./ui/new-trip-modal";
import { tripSkeleton } from "./core/gmaps-out";
import { firstEmoji } from "./core/category";

/**
 * Wayfarer: the note is the plan, the pane is the map.
 *
 * `src/core` is Obsidian-free and unit tested. This file wires it to the
 * editor (paste conversion, cursor tracking), the map view, and settings.
 */
export default class WayfarerPlugin extends Plugin {
  settings: WayfarerSettings = { ...DEFAULT_SETTINGS };
  private views = new Set<WayfarerView>();
  private current: { file: TFile; itinerary: Itinerary } | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
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

  async loadSettings(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) as Partial<WayfarerSettings> | null) };
  }
  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
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
    if (this.settings.autoOpen && itinerary.stops.length > 0 && this.views.size === 0 && !Platform.isMobile && !this.mapLeaf()) void this.openMap();
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

  private activeMarkdown(): MarkdownView | null {
    return this.app.workspace.getActiveViewOfType(MarkdownView);
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
      const tags: string[] = [];
      if (this.settings.addDayTag) {
        const heading = headingIndexAtLine(editor.getValue(), line, this.settings.dayHeadingLevel);
        if (heading >= 0) tags.push(`d${heading + 1}`);
      }
      const lineText = editor.getLine(line);
      const hasEmoji = firstEmoji(lineText.slice(0, Math.max(0, lineText.indexOf(url)))) !== null;
      if (!replaceUrlInEditor(editor, line, url, stopText(place, tags, this.settings.addEmoji && !hasEmoji))) {
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

/** Zero-based index (among day headings, in order) of the heading above `line`, or -1. */
export function headingIndexAtLine(markdown: string, line: number, maxLevel: number): number {
  const re = new RegExp(`^#{1,${maxLevel}}\\s`);
  let idx = -1;
  const lines = markdown.split("\n");
  for (let i = 0; i <= line && i < lines.length; i++) if (re.test(lines[i])) idx++;
  return idx;
}
