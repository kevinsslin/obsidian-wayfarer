import { ItemView, MarkdownView, TFile, type WorkspaceLeaf } from "obsidian";
import * as L from "leaflet";
import { CATEGORY_EMOJI, TRANSPORT_EMOJI } from "../core/category";
import { dayColor } from "../core/colors";
import { directionsUrl, placeUrl } from "../core/gmaps-out";
import type { Day, Itinerary, Stop } from "../core/itinerary";
import type WayfarerPlugin from "../main";
import { googlePhotoUrl } from "../net";

export const VIEW_TYPE_WAYFARER = "wayfarer";

/**
 * The map pane. Three bands: day chips on top, the map, and a strip of the
 * active day's stops along the bottom. The day under the editor cursor is
 * drawn at full strength; when the cursor sits on a stop the map flies there.
 */
export class WayfarerView extends ItemView {
  private map: L.Map | null = null;
  private tiles: L.TileLayer | null = null;
  private layer: L.LayerGroup = L.layerGroup();
  private markers = new Map<Stop, L.Marker>();
  private legendEl!: HTMLElement;
  private mapEl!: HTMLElement;
  private stripEl!: HTMLElement;
  private emptyEl!: HTMLElement;
  private file: TFile | null = null;
  private itinerary: Itinerary | null = null;
  private activeDay = -1;
  /** Day pinned by clicking the legend; -1 follows the cursor. */
  private pinnedDay = -1;
  private focused: Stop | null = null;
  private fittedFor: string | null = null;
  /** Set while the user pans; cleared when the cursor moves to another line. */
  private userMoved = false;
  private flying = false;
  private lastCursorLine = -1;

  constructor(leaf: WorkspaceLeaf, private plugin: WayfarerPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_WAYFARER;
  }
  getDisplayText(): string {
    return this.file ? `Map: ${this.file.basename}` : "Wayfarer map";
  }
  getIcon(): string {
    return "map";
  }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("wayfarer-view");
    this.legendEl = root.createDiv({ cls: "wf-legend" });
    this.mapEl = root.createDiv({ cls: "wf-map" });
    this.stripEl = root.createDiv({ cls: "wf-strip" });
    this.emptyEl = root.createDiv({ cls: "wf-empty" });
    this.emptyEl.setText("No stops in this note yet. Paste a Google Maps link, or write [Name](geo:lat,lng).");

    this.map = L.map(this.mapEl, { zoomControl: true, attributionControl: true, worldCopyJump: true });
    this.map.setView([35.68, 139.76], 5);
    this.applyTiles();
    this.layer.addTo(this.map);
    this.map.on("dragstart", () => (this.userMoved = true));
    this.map.on("zoomstart", () => { if (!this.flying) this.userMoved = true; });
    this.map.on("moveend zoomend", () => (this.flying = false));

    // Leaflet measures its container once; the pane can be resized or hidden.
    const ro = new ResizeObserver(() => this.map?.invalidateSize());
    ro.observe(this.mapEl);
    this.register(() => ro.disconnect());

    // Popup anchors live inside Leaflet's DOM, outside Obsidian's link handling.
    this.registerDomEvent(this.mapEl, "click", (evt) => {
      const t = evt.target as HTMLElement;
      const a = t.closest?.("a.wf-ext");
      if (a instanceof HTMLAnchorElement) {
        evt.preventDefault();
        window.open(a.href);
        return;
      }
      const jump = t.closest?.("[data-wf-jump]");
      if (jump instanceof HTMLElement && this.focused) void this.jumpTo(this.focused);
    });

    this.plugin.attachView(this);
  }

  async onClose(): Promise<void> {
    this.plugin.detachView(this);
    this.map?.remove();
    this.map = null;
  }

  applyTiles(): void {
    if (!this.map) return;
    this.tiles?.remove();
    this.tiles = L.tileLayer(this.plugin.settings.tileUrl, {
      attribution: this.plugin.settings.tileAttribution,
      maxZoom: 19,
    }).addTo(this.map);
  }

  /** Replaces the rendered itinerary. `cursorDay` picks the day to emphasise. */
  render(file: TFile | null, itinerary: Itinerary | null, cursorDay: number): void {
    if (!this.map) return;
    const fileChanged = file?.path !== this.file?.path;
    this.file = file;
    this.itinerary = itinerary;
    if (fileChanged) {
      this.pinnedDay = -1;
      this.focused = null;
      this.userMoved = false;
    }
    this.activeDay = this.pinnedDay >= 0 ? this.pinnedDay : cursorDay;
    if (this.focused) this.focused = this.sameStop(this.focused);
    (this.leaf as WorkspaceLeaf & { updateHeader?: () => void }).updateHeader?.();

    this.draw();
    const stops = itinerary?.stops ?? [];
    this.emptyEl.toggleClass("is-hidden", stops.length > 0);
    if (!itinerary || stops.length === 0) return;

    if (fileChanged || this.fittedFor !== file?.path) {
      this.fitAll(stops);
      this.fittedFor = file?.path ?? null;
    }
  }

  /**
   * Cursor moved to `line`, which lies in day `day` (or -1). A stop on that
   * line becomes the focus and the map flies to it; a line elsewhere in a
   * day only switches the emphasised day.
   */
  onCursor(line: number, day: number): void {
    if (!this.itinerary || !this.map) return;
    const lineChanged = line !== this.lastCursorLine;
    this.lastCursorLine = line;
    if (lineChanged) this.userMoved = false;

    const stop = this.itinerary.stops.find((s) => s.line === line) ?? null;
    const dayChanged = this.pinnedDay < 0 && day !== this.activeDay;
    if (this.pinnedDay < 0) this.activeDay = day;
    if (stop === this.focused && !dayChanged) return;
    this.focused = stop;
    this.draw();

    if (!this.plugin.settings.followCursor || this.userMoved) return;
    if (stop) this.flyToStop(stop);
    else if (dayChanged && day >= 0) {
      const d = this.itinerary.days.find((x) => x.index === day);
      if (d) this.fitAll(d.stops);
    }
  }

  /* ---------- drawing ---------- */

  /**
   * Focus a stop without rebuilding the layers, so the popup that opened on
   * the click survives. If the stop's day is not the emphasised one, the
   * whole pane redraws and the popup reopens.
   */
  private setFocus(stop: Stop): void {
    const prev = this.focused;
    this.focused = stop;
    if (this.pinnedDay < 0 && this.activeDay !== -1 && this.activeDay !== stop.dayIndex) {
      this.activeDay = stop.dayIndex;
      this.draw();
      this.markers.get(stop)?.openPopup();
      return;
    }
    for (const s of [prev, stop]) {
      const el = s && this.markers.get(s)?.getElement();
      if (el) el.toggleClass("is-focus", s === stop);
    }
    this.stripEl.empty();
    if (this.itinerary) this.drawStrip(this.itinerary);
  }

  private draw(): void {
    this.layer.clearLayers();
    this.markers.clear();
    this.legendEl.empty();
    this.stripEl.empty();
    if (!this.itinerary || this.itinerary.stops.length === 0) return;
    for (const day of this.itinerary.days) this.drawDay(day);
    this.drawLegend(this.itinerary);
    this.drawStrip(this.itinerary);
  }

  private drawDay(day: Day): void {
    const color = dayColor(day.index);
    const dim = this.activeDay >= 0 && this.activeDay !== day.index;
    const cls = dim ? "wf-dim" : "wf-active";

    if (this.plugin.settings.drawRoutes) {
      for (let i = 1; i < day.stops.length; i++) {
        const a = day.stops[i - 1];
        const b = day.stops[i];
        const mode = b.transport;
        const dash = mode === "walk" ? "2 6" : mode === "flight" ? "12 8" : mode === "boat" ? "8 4 2 4" : "6 6";
        L.polyline([L.latLng(a.lat, a.lng), L.latLng(b.lat, b.lng)], {
          color,
          weight: dim ? 2 : mode === "walk" ? 3 : 3,
          opacity: dim ? 0.25 : 0.8,
          dashArray: dash,
          className: cls,
        }).addTo(this.layer);
      }
    }
    day.stops.forEach((stop, i) => {
      const focus = stop === this.focused;
      const glyph = stop.emoji ?? CATEGORY_EMOJI[stop.category];
      const icon = L.divIcon({
        className: `wf-pin ${cls}${focus ? " is-focus" : ""}`,
        html: `<span class="wf-pin-body" style="--wf-color:${color}"><span class="wf-pin-glyph">${glyph}</span><span class="wf-pin-n">${i + 1}</span></span>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
        popupAnchor: [0, -16],
      });
      const marker = L.marker([stop.lat, stop.lng], { icon, title: stop.name, zIndexOffset: focus ? 2000 : dim ? 0 : 1000 });
      marker.bindTooltip(stop.time ? `${stop.time} ${stop.name}` : stop.name, { direction: "top", offset: [0, -14], className: "wf-tooltip", permanent: focus });
      marker.bindPopup(() => this.popupEl(day, stop), { className: "wf-popup", closeButton: false, maxWidth: 280, minWidth: 220 });
      marker.on("click", () => {
        this.userMoved = true;
        this.setFocus(stop);
        void this.jumpTo(stop, false);
      });
      marker.addTo(this.layer);
      this.markers.set(stop, marker);
    });
  }

  private popupEl(day: Day, stop: Stop): HTMLElement {
    const root = createDiv({ cls: "wf-card" });
    const img = this.imageUrl(stop);
    if (img) {
      const el = root.createEl("img", { cls: "wf-card-img", attr: { src: img, alt: "" } });
      el.onerror = () => el.remove();
    }
    const body = root.createDiv({ cls: "wf-card-body" });
    const title = body.createDiv({ cls: "wf-card-title" });
    title.createSpan({ text: `${stop.emoji ?? CATEGORY_EMOJI[stop.category]} ` });
    title.createSpan({ text: stop.name });
    const sub = [day.label || `Day ${day.index + 1}`, `#${stop.index + 1}`];
    if (stop.time) sub.push(stop.time);
    if (stop.transport) sub.push(TRANSPORT_EMOJI[stop.transport]);
    body.createDiv({ cls: "wf-card-sub", text: sub.join(" · ") });
    const facts: string[] = [];
    if (stop.meta?.rating) facts.push(`★ ${stop.meta.rating.toFixed(1)}`);
    const today = todayHours(stop.meta?.hours);
    if (today) facts.push(today.replace(/^[^:]+:\s*/, ""));
    if (facts.length) body.createDiv({ cls: "wf-card-facts", text: facts.join(" · ") });
    const note = stop.note.startsWith(stop.name) ? stop.note.slice(stop.name.length).replace(/^[\s,，、:：]+/, "") : stop.note;
    if (note) body.createDiv({ cls: "wf-card-note", text: note });
    if (stop.meta?.address) body.createDiv({ cls: "wf-card-addr", text: stop.meta.address });
    const actions = body.createDiv({ cls: "wf-card-actions" });
    actions.createEl("a", { cls: "wf-ext", text: "Google Maps ↗", attr: { href: placeUrl(stop) } });
    const prev = day.stops[stop.index - 1];
    if (prev) actions.createEl("a", { cls: "wf-ext", text: `${TRANSPORT_EMOJI[stop.transport ?? "train"]} 從上一站 ↗`, attr: { href: directionsUrl([prev, stop], stop.transport === "walk" ? "walking" : stop.transport === "car" ? "driving" : "transit") ?? "#" } });
    if (stop.meta?.website) actions.createEl("a", { cls: "wf-ext", text: "網站 ↗", attr: { href: stop.meta.website } });
    actions.createEl("a", { text: "到這行", attr: { href: "#", "data-wf-jump": "1" } });
    return root;
  }

  /** A vault image (`![[file]]`), a URL, or the Google photo when a key is set. */
  private imageUrl(stop: Stop): string | null {
    if (stop.image) {
      if (/^https?:\/\//.test(stop.image)) return stop.image;
      const f = this.file ? this.plugin.app.metadataCache.getFirstLinkpathDest(stop.image, this.file.path) : null;
      return f ? this.plugin.app.vault.getResourcePath(f) : null;
    }
    const key = this.plugin.settings.googleApiKey;
    if (stop.meta?.photo && key) return googlePhotoUrl(key, stop.meta.photo);
    return null;
  }

  private drawLegend(it: Itinerary): void {
    for (const day of it.days) {
      const chip = this.legendEl.createEl("button", { cls: "wf-chip", text: day.label || `Day ${day.index + 1}` });
      chip.style.setProperty("--wf-color", dayColor(day.index));
      chip.toggleClass("is-active", this.activeDay === day.index);
      chip.toggleClass("is-pinned", this.pinnedDay === day.index);
      chip.setAttr("aria-label", `${day.title} (${day.stops.length})`);
      chip.onclick = () => {
        this.pinnedDay = this.pinnedDay === day.index ? -1 : day.index;
        this.activeDay = this.pinnedDay;
        this.focused = null;
        this.draw();
        this.fitAll(this.pinnedDay >= 0 ? day.stops : it.stops);
      };
    }
    const all = this.legendEl.createEl("button", { cls: "wf-chip wf-chip-all", text: "全部" });
    all.toggleClass("is-active", this.activeDay === -1);
    all.onclick = () => {
      this.pinnedDay = -1;
      this.activeDay = -1;
      this.focused = null;
      this.draw();
      this.fitAll(it.stops);
    };
    const right = this.legendEl.createDiv({ cls: "wf-legend-right" });
    const follow = right.createEl("button", { cls: "wf-chip wf-chip-icon", text: "📍" });
    follow.toggleClass("is-active", this.plugin.settings.followCursor);
    follow.setAttr("aria-label", this.plugin.settings.followCursor ? "Map follows the cursor (click to stop)" : "Map stays put (click to follow the cursor)");
    follow.onclick = () => {
      this.plugin.settings.followCursor = !this.plugin.settings.followCursor;
      void this.plugin.saveSettings();
      this.draw();
    };
    const active = it.days.find((d) => d.index === this.activeDay);
    if (active) {
      const url = directionsUrl(active.stops);
      if (url) {
        const go = right.createEl("button", { cls: "wf-chip wf-chip-go", text: "路線 ↗" });
        go.setAttr("aria-label", `${active.label}: open the day's stops as directions in Google Maps`);
        go.onclick = () => window.open(url);
      }
    }
  }

  /** The active day's stops as a horizontal timeline; the whole trip when no day is active. */
  private drawStrip(it: Itinerary): void {
    const day = it.days.find((d) => d.index === this.activeDay);
    const days = day ? [day] : it.days;
    for (const d of days) {
      if (!day) this.stripEl.createDiv({ cls: "wf-strip-day", text: d.label || `Day ${d.index + 1}` }).style.setProperty("--wf-color", dayColor(d.index));
      d.stops.forEach((stop, i) => {
        const card = this.stripEl.createEl("button", { cls: "wf-stop" });
        card.style.setProperty("--wf-color", dayColor(d.index));
        card.toggleClass("is-focus", stop === this.focused);
        const top = card.createDiv({ cls: "wf-stop-top" });
        top.createSpan({ cls: "wf-stop-n", text: String(i + 1) });
        if (stop.time) top.createSpan({ cls: "wf-stop-time", text: stop.time });
        if (stop.transport && i > 0) top.createSpan({ cls: "wf-stop-mode", text: TRANSPORT_EMOJI[stop.transport] });
        const main = card.createDiv({ cls: "wf-stop-main" });
        main.createSpan({ cls: "wf-stop-glyph", text: stop.emoji ?? CATEGORY_EMOJI[stop.category] });
        main.createSpan({ cls: "wf-stop-name", text: stop.name });
        if (stop.meta?.rating) card.createDiv({ cls: "wf-stop-sub", text: `★ ${stop.meta.rating.toFixed(1)}` });
        card.onclick = () => {
          this.focused = stop;
          this.userMoved = false;
          this.draw();
          this.flyToStop(stop);
          void this.jumpTo(stop, false);
          this.markers.get(stop)?.openPopup();
        };
        if (stop === this.focused) window.setTimeout(() => card.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" }), 0);
      });
    }
  }

  /* ---------- camera ---------- */

  private flyToStop(stop: Stop): void {
    if (!this.map) return;
    this.map.invalidateSize(false);
    const size = this.map.getSize();
    if (size.x === 0 || size.y === 0) return;
    const target = L.latLng(stop.lat, stop.lng);
    const zoom = Math.max(this.map.getZoom(), 14);
    this.flying = true;
    if (this.map.getBounds().pad(-0.2).contains(target) && this.map.getZoom() >= 13) this.map.panTo(target, { animate: true, duration: 0.4 });
    else this.map.flyTo(target, zoom, { duration: 0.6 });
  }

  /**
   * Leaflet computes bounds against the container size, which is 0x0 while
   * the pane is still being laid out, so measure first and retry once the
   * container has a size.
   */
  private fitAll(stops: Stop[], attempt = 0): void {
    if (!this.map || stops.length === 0) return;
    this.map.invalidateSize(false);
    const size = this.map.getSize();
    if ((size.x === 0 || size.y === 0) && attempt < 20) {
      window.setTimeout(() => this.fitAll(stops, attempt + 1), 50);
      return;
    }
    this.flying = true;
    if (stops.length === 1) {
      this.map.setView([stops[0].lat, stops[0].lng], 14);
      return;
    }
    this.map.fitBounds(L.latLngBounds(stops.map((s) => [s.lat, s.lng] as [number, number])), { padding: [36, 36], maxZoom: 15 });
  }

  private sameStop(s: Stop): Stop | null {
    return this.itinerary?.stops.find((x) => x.line === s.line && x.from === s.from) ?? this.itinerary?.stops.find((x) => x.name === s.name && x.lat === s.lat && x.lng === s.lng) ?? null;
  }

  /** Puts the editor cursor on the stop and scrolls it into view. */
  private async jumpTo(stop: Stop, focusEditor = true): Promise<void> {
    if (!this.file) return;
    let view = this.plugin.app.workspace.getLeavesOfType("markdown")
      .map((l) => l.view)
      .find((v): v is MarkdownView => v instanceof MarkdownView && v.file?.path === this.file?.path);
    if (!view) {
      const leaf = this.plugin.app.workspace.getLeaf(false);
      await leaf.openFile(this.file);
      view = leaf.view instanceof MarkdownView ? leaf.view : undefined;
    }
    if (!view) return;
    this.lastCursorLine = stop.line;
    if (focusEditor) this.plugin.app.workspace.setActiveLeaf(view.leaf, { focus: true });
    const pos = { line: stop.line, ch: stop.from };
    view.editor.setCursor(pos);
    view.editor.scrollIntoView({ from: pos, to: { line: stop.line, ch: stop.to } }, true);
  }
}

/** Picks today's line from Google's weekdayDescriptions, e.g. "Wednesday: 9:00 AM – 5:00 PM". */
export function todayHours(hours: string[] | undefined, now = new Date()): string | null {
  if (!hours?.length) return null;
  const names = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const cjk = ["日", "一", "二", "三", "四", "五", "六"];
  const d = now.getDay();
  return (
    hours.find((h) => h.toLowerCase().startsWith(names[d])) ??
    hours.find((h) => h.startsWith(`星期${cjk[d]}`) || h.startsWith(`週${cjk[d]}`) || h.startsWith(`${cjk[d]}曜日`)) ??
    hours[d] ??
    null
  );
}
