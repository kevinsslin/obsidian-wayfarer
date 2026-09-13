import { ItemView, MarkdownView, TFile, type WorkspaceLeaf } from "obsidian";
import * as L from "leaflet";
import { dayColor } from "../core/colors";
import { directionsUrl, placeUrl } from "../core/gmaps-out";
import type { Day, Itinerary, Stop } from "../core/itinerary";
import type ItineraryMapPlugin from "../main";

export const VIEW_TYPE_ITINERARY_MAP = "itinerary-map";

/**
 * The map pane. Shows the active note's stops coloured and numbered by day,
 * with a line through each day. The day under the editor cursor is drawn at
 * full strength and the others dimmed, so scrolling the note walks the map.
 */
export class ItineraryMapView extends ItemView {
  private map: L.Map | null = null;
  private tiles: L.TileLayer | null = null;
  private layer: L.LayerGroup = L.layerGroup();
  private legendEl!: HTMLElement;
  private emptyEl!: HTMLElement;
  private mapEl!: HTMLElement;
  private file: TFile | null = null;
  private itinerary: Itinerary | null = null;
  private activeDay = -1;
  /** Day pinned by clicking the legend; -1 follows the cursor. */
  private pinnedDay = -1;
  private fittedFor: string | null = null;

  constructor(leaf: WorkspaceLeaf, private plugin: ItineraryMapPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_ITINERARY_MAP;
  }
  getDisplayText(): string {
    return this.file ? `Map: ${this.file.basename}` : "Itinerary map";
  }
  getIcon(): string {
    return "map";
  }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("itinerary-map-view");
    this.legendEl = root.createDiv({ cls: "im-legend" });
    this.mapEl = root.createDiv({ cls: "im-map" });
    this.emptyEl = root.createDiv({ cls: "im-empty" });
    this.emptyEl.setText("No stops in this note yet. Paste a Google Maps link, or write [Name](geo:lat,lng).");

    this.map = L.map(this.mapEl, { zoomControl: true, attributionControl: true, worldCopyJump: true });
    this.map.setView([35.68, 139.76], 5);
    this.applyTiles();
    this.layer.addTo(this.map);

    // Leaflet measures its container once; the pane can be resized or hidden.
    const ro = new ResizeObserver(() => this.map?.invalidateSize());
    ro.observe(this.mapEl);
    this.register(() => ro.disconnect());

    // Popup anchors live inside Leaflet's DOM, outside Obsidian's link handling.
    this.registerDomEvent(this.mapEl, "click", (evt) => {
      const a = (evt.target as HTMLElement).closest?.("a.im-ext");
      if (a instanceof HTMLAnchorElement) {
        evt.preventDefault();
        window.open(a.href);
      }
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

  /** Replaces the rendered itinerary. `cursorLine` picks the day to emphasise. */
  render(file: TFile | null, itinerary: Itinerary | null, cursorDay: number): void {
    if (!this.map) return;
    const fileChanged = file?.path !== this.file?.path;
    this.file = file;
    this.itinerary = itinerary;
    if (fileChanged) this.pinnedDay = -1;
    this.activeDay = this.pinnedDay >= 0 ? this.pinnedDay : cursorDay;
    (this.leaf as WorkspaceLeaf & { updateHeader?: () => void }).updateHeader?.();

    this.layer.clearLayers();
    this.legendEl.empty();
    const stops = itinerary?.stops ?? [];
    this.emptyEl.toggleClass("is-hidden", stops.length > 0);
    if (!itinerary || stops.length === 0) return;

    for (const day of itinerary.days) this.drawDay(day);
    this.drawLegend(itinerary);

    if (fileChanged || this.fittedFor !== file?.path) {
      this.fitAll(stops);
      this.fittedFor = file?.path ?? null;
    }
  }

  /** Called on cursor moves only; cheaper than a full render. */
  setActiveDay(day: number): void {
    if (this.pinnedDay >= 0 || day === this.activeDay || !this.itinerary) return;
    this.activeDay = day;
    this.layer.clearLayers();
    this.legendEl.empty();
    for (const d of this.itinerary.days) this.drawDay(d);
    this.drawLegend(this.itinerary);
  }

  private drawDay(day: Day): void {
    const color = dayColor(day.index);
    const dim = this.activeDay >= 0 && this.activeDay !== day.index;
    const cls = dim ? "im-dim" : "im-active";
    const latlngs = day.stops.map((s) => L.latLng(s.lat, s.lng));

    if (this.plugin.settings.drawRoutes && latlngs.length > 1) {
      L.polyline(latlngs, { color, weight: dim ? 2 : 3, opacity: dim ? 0.25 : 0.8, dashArray: "6 6", className: cls }).addTo(this.layer);
    }
    day.stops.forEach((stop, i) => {
      const icon = L.divIcon({
        className: `im-pin ${cls}`,
        html: `<span class="im-pin-dot" style="background:${color}">${i + 1}</span>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
        popupAnchor: [0, -12],
      });
      const marker = L.marker([stop.lat, stop.lng], { icon, title: stop.name, zIndexOffset: dim ? 0 : 1000 });
      marker.bindTooltip(stop.name, { direction: "top", offset: [0, -10], className: "im-tooltip" });
      marker.bindPopup(this.popupHtml(day, stop), { className: "im-popup", closeButton: false });
      marker.on("click", () => this.jumpTo(stop));
      marker.addTo(this.layer);
    });
  }

  private popupHtml(day: Day, stop: Stop): string {
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    const bits = [`<b>${esc(stop.name)}</b>`, `<span class="im-popup-day">${esc(day.label)} · #${stop.index + 1}</span>`];
    if (stop.meta?.rating) bits.push(`★ ${stop.meta.rating.toFixed(1)}`);
    const today = todayHours(stop.meta?.hours);
    if (today) bits.push(esc(today));
    if (stop.meta?.address) bits.push(`<small>${esc(stop.meta.address)}</small>`);
    bits.push(`<a class="im-ext" href="${placeUrl(stop)}">Open in Google Maps</a>`);
    return bits.join("<br>");
  }

  private drawLegend(it: Itinerary): void {
    for (const day of it.days) {
      const chip = this.legendEl.createEl("button", { cls: "im-chip", text: day.label || `Day ${day.index + 1}` });
      chip.style.setProperty("--im-color", dayColor(day.index));
      chip.toggleClass("is-active", this.activeDay === day.index);
      chip.toggleClass("is-pinned", this.pinnedDay === day.index);
      chip.setAttr("aria-label", `${day.title} (${day.stops.length})`);
      chip.onclick = () => {
        this.pinnedDay = this.pinnedDay === day.index ? -1 : day.index;
        this.activeDay = this.pinnedDay;
        this.render(this.file, this.itinerary, this.pinnedDay);
        if (this.pinnedDay >= 0) this.fitAll(day.stops);
      };
    }
    const active = it.days.find((d) => d.index === this.activeDay);
    if (active) {
      const url = directionsUrl(active.stops);
      if (url) {
        const go = this.legendEl.createEl("button", { cls: "im-chip im-chip-go", text: "Google Maps 路線 ↗" });
        go.setAttr("aria-label", `${active.label}: open the day's stops as directions in Google Maps`);
        go.onclick = () => window.open(url);
      }
    }
    const all = this.legendEl.createEl("button", { cls: "im-chip im-chip-all", text: "全部" });
    all.toggleClass("is-active", this.activeDay === -1);
    all.onclick = () => {
      this.pinnedDay = -1;
      this.activeDay = -1;
      this.render(this.file, this.itinerary, -1);
      this.fitAll(this.itinerary?.stops ?? []);
    };
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
    if (stops.length === 1) {
      this.map.setView([stops[0].lat, stops[0].lng], 14);
      return;
    }
    this.map.fitBounds(L.latLngBounds(stops.map((s) => [s.lat, s.lng] as [number, number])), { padding: [28, 28], maxZoom: 15 });
  }

  /** Puts the editor cursor on the stop and scrolls it into view. */
  private async jumpTo(stop: Stop): Promise<void> {
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
    this.plugin.app.workspace.setActiveLeaf(view.leaf, { focus: true });
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
