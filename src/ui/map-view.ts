import { ItemView, MarkdownView, TFile, type WorkspaceLeaf } from "obsidian";
import * as L from "leaflet";
import { CATEGORY_EMOJI, TRANSPORT_EMOJI, type Transport } from "../core/category";
import { dayColor } from "../core/colors";
import { directionsUrl, placeUrl } from "../core/gmaps-out";
import { stopNotes, type Day, type Itinerary, type Stop } from "../core/itinerary";
import { legText, type Leg } from "../core/legs";
import { checkHours, describeHours } from "../core/schedule";
import { minutesOf } from "../core/legs";
import { dateForDay, routable } from "../routing";
import { t } from "../core/i18n";
import type WayfarerPlugin from "../main";


export const VIEW_TYPE_WAYFARER = "wayfarer";

const MODES: Transport[] = ["walk", "bike", "car", "taxi", "bus", "train", "metro", "tram", "boat", "flight"];

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
    const body = root.createDiv({ cls: "wf-body" });
    this.stripEl = body.createDiv({ cls: "wf-strip" });
    const divider = body.createDiv({ cls: "wf-divider" });
    const toggle = divider.createEl("button", { cls: "wf-divider-toggle" });
    toggle.onpointerdown = (e) => e.stopPropagation();
    toggle.onclick = (e) => {
      e.stopPropagation();
      this.plugin.settings.listOpen = !this.plugin.settings.listOpen;
      void this.plugin.saveSettings();
      this.applySplit();
      this.map?.invalidateSize();
    };
    this.mapEl = body.createDiv({ cls: "wf-map" });
    // Set inline so Leaflet sees it at construction even before styles.css has loaded; otherwise it forces position: relative.
    this.mapEl.style.position = "absolute";
    this.mapEl.style.inset = "0";
    this.emptyEl = root.createDiv({ cls: "wf-empty" });
    this.emptyEl.setText(t("empty"));
    this.applySplit();
    divider.onpointerdown = (down) => {
      down.preventDefault();
      divider.setPointerCapture(down.pointerId);
      const move = (e: PointerEvent) => {
        const left = body.getBoundingClientRect().left + 10;
        this.plugin.settings.listWidth = Math.min(480, Math.max(180, Math.round(e.clientX - left)));
        this.applySplit();
        this.map?.invalidateSize();
      };
      const up = () => {
        divider.removeEventListener("pointermove", move);
        divider.removeEventListener("pointerup", up);
        void this.plugin.saveSettings();
      };
      divider.addEventListener("pointermove", move);
      divider.addEventListener("pointerup", up);
    };

    // The timeline floats over the map's left edge, so the zoom buttons go right.
    this.map = L.map(this.mapEl, { zoomControl: false, attributionControl: true, worldCopyJump: true });
    L.control.zoom({ position: "topright" }).addTo(this.map);
    this.map.setView([35.68, 139.76], 5);
    this.applyTiles();
    this.layer.addTo(this.map);
    this.map.on("dragstart", () => (this.userMoved = true));
    this.map.on("zoomstart", () => { if (!this.flying) this.userMoved = true; });
    this.map.on("moveend zoomend", () => (this.flying = false));
    // Arrowheads sit a fixed number of pixels before the pin, so they move with the zoom.
    // The rebuild removes the markers, and with them an open popup, so put the focused one back.
    this.map.on("zoomend", () => {
      const keep = this.focused && this.markers.get(this.focused)?.isPopupOpen() ? this.focused : null;
      this.draw();
      if (keep) this.openPopup(keep);
    });

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

  private applySplit(): void {
    const open = this.plugin.settings.listOpen;
    this.contentEl.querySelector<HTMLElement>(".wf-body")?.style.setProperty("--wf-list-width", `${this.plugin.settings.listWidth}px`);
    this.stripEl.toggleClass("is-hidden", !open);
    const divider = this.contentEl.querySelector(".wf-divider");
    divider?.toggleClass("is-closed", !open);
    const toggle = divider?.querySelector(".wf-divider-toggle");
    if (toggle) {
      toggle.textContent = open ? "‹" : "›";
      toggle.setAttribute("aria-label", open ? t("list_hide") : t("list_show"));
    }
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

    // A leaf change re-sends the same note. Rebuilding the pane then would swallow the click
    // that caused it (the chip under the pointer is replaced between mousedown and mouseup).
    const sig = `${file?.path}|${this.activeDay}|${this.focused?.line ?? -1}|${signatureOf(itinerary)}`;
    if (sig === this.lastSig) return;
    this.lastSig = sig;
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

  /** Redraw with the same data, e.g. when routed legs arrive. */
  redraw(): void {
    if (this.itinerary) this.draw();
  }

  private legsOf(day: Day): Leg[] {
    return this.plan(day).legs;
  }

  /** Legs for a day plus the date read from its heading. */
  plan(day: Day): { legs: Leg[]; date: Date | null } {
    const date = dateForDay(day);
    return { legs: this.plugin.router.legsFor(day, date), date };
  }

  /** Opening-hours problem for a stop with a written time, or null. */
  private hoursWarning(stop: Stop, date: Date | null): string | null {
    if (!date || !stop.meta?.hours) return null;
    const st = checkHours(stop.meta.hours, date.getDay(), minutesOf(stop.time) ?? undefined);
    return st ? describeHours(st) : null;
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
      this.openPopup(stop);
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
    this.lastSig = "";
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
      for (const leg of this.legsOf(day)) {
        const mode = leg.mode;
        const lineColor = leg.lateBy > 0 && !dim ? "#d0342c" : color;
        // A routed leg follows the road and is solid; a straight line stands for "no route known" and is dashed.
        const pts = leg.geometry.map(([a, b]) => L.latLng(a, b));
        const straight = pts.length <= 2;
        const line = L.polyline(pts, {
          color: lineColor,
          weight: dim ? 2 : straight ? 2.5 : mode === "walk" ? 3.5 : 4,
          opacity: dim ? 0.25 : straight ? 0.7 : 0.9,
          dashArray: straight ? "2 9" : undefined,
          lineCap: "round",
          lineJoin: "round",
          className: cls,
        }).addTo(this.layer);
        if (!dim) line.bindTooltip(tipEl(legTooltip(leg)), { sticky: true, className: "wf-tooltip" });
        this.drawArrow(pts, lineColor, cls);
        if (mode && !dim) {
          const mid = midpointOf(pts);
          L.marker(mid, {
            icon: L.divIcon({ className: `wf-leg-glyph ${cls}`, html: `<span style="--wf-color:${lineColor}">${TRANSPORT_EMOJI[mode]}</span>`, iconSize: [24, 24], iconAnchor: [12, 12] }),
            interactive: true,
            keyboard: false,
          }).bindTooltip(tipEl(legTooltip(leg)), { className: "wf-tooltip", direction: "top", offset: [0, -10] }).addTo(this.layer);
        }
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
      marker.bindTooltip(tipEl(stop.time ? `${stop.time} ${stop.name}` : stop.name), { direction: "top", offset: [0, -14], className: "wf-tooltip", permanent: focus });
      marker.bindPopup(() => this.popupEl(day, stop), { className: "wf-popup", closeButton: false, maxWidth: 320, minWidth: 260 });
      marker.on("click", () => {
        this.userMoved = true;
        this.setFocus(stop);
        void this.jumpTo(stop, false);
      });
      // Hovering a pin shows its card; it goes away with the pointer unless the stop is the focused one.
      marker.on("mouseover", () => {
        if (this.flying) return;
        window.clearTimeout(this.hoverClose);
        if (!marker.isPopupOpen()) this.openPopup(stop);
      });
      marker.on("mouseout", () => this.closeHoverPopup(stop, marker));
      marker.on("popupopen", (e) => {
        const el = (e as L.PopupEvent).popup.getElement();
        if (!el) return;
        el.onmouseenter = () => window.clearTimeout(this.hoverClose);
        el.onmouseleave = () => this.closeHoverPopup(stop, marker);
      });
      marker.addTo(this.layer);
      this.markers.set(stop, marker);
    });
  }

  private popupEl(day: Day, stop: Stop): HTMLElement {
    const root = createDiv({ cls: "wf-card" });
    const photo = this.plugin.photoFor(stop);
    if (photo) {
      const wrap = root.createDiv({ cls: "wf-card-imgwrap" });
      const el = wrap.createEl("img", { cls: "wf-card-img", attr: { src: photo.url, alt: "" } });
      el.onerror = () => wrap.remove();
      if (photo.credit) wrap.createSpan({ cls: "wf-card-credit", text: photo.credit });
    }
    const body = root.createDiv({ cls: "wf-card-body" });
    const title = body.createDiv({ cls: "wf-card-title" });
    title.createSpan({ text: `${stop.emoji ?? CATEGORY_EMOJI[stop.category]} ` });
    title.createSpan({ text: stop.name });
    const sub = [day.label || `Day ${day.index + 1}`, `#${stop.index + 1}`];
    if (stop.time) sub.push(stop.time);
    body.createDiv({ cls: "wf-card-sub", text: sub.join(" · ") });
    const { date } = this.plan(day);
    const facts: string[] = [];
    const warn = this.hoursWarning(stop, date);
    if (warn) body.createDiv({ cls: "wf-card-warn", text: `⚠ ${warn}` });
    if (stop.meta?.rating) facts.push(`★ ${stop.meta.rating.toFixed(1)}`);
    const today = todayHours(stop.meta?.hours);
    if (today) facts.push(today.replace(/^[^:]+:\s*/, ""));
    if (facts.length) body.createDiv({ cls: "wf-card-facts", text: facts.join(" · ") });
    for (const n of stopNotes(stop)) body.createDiv({ cls: "wf-card-note", text: n });
    if (stop.meta?.address) body.createDiv({ cls: "wf-card-addr", text: stop.meta.address });
    const actions = body.createDiv({ cls: "wf-card-actions" });
    actions.createEl("a", { cls: "wf-ext", text: t("open_gmaps"), attr: { href: placeUrl(stop) } });
    const prev = day.stops[stop.index - 1];
    const leg = prev ? this.legsOf(day)[stop.index - 1] : undefined;
    if (leg && prev) {
      // One line for the leg: mode, where from, numbers. With a mode it is also the directions link.
      const t2 = body.createDiv({ cls: `wf-card-leg${leg.lateBy > 0 ? " is-late" : ""}` });
      const text = `${leg.mode ? TRANSPORT_EMOJI[leg.mode] + " " : ""}${t("from_prev", { name: prev.name })} · ${legText(leg)}${leg.lateBy ? " · " + t("late_by", { n: leg.lateBy }) : ""}`;
      const url = leg.mode ? directionsUrl([prev, stop], leg.mode === "walk" ? "walking" : leg.mode === "car" || leg.mode === "taxi" ? "driving" : "transit") : null;
      if (url) t2.createEl("a", { cls: "wf-ext", text: `${text} ↗`, attr: { href: url, "aria-label": t("from_prev_dir") } });
      else t2.setText(text);
      body.insertBefore(t2, actions);
    }
    if (stop.meta?.website && /^https?:\/\//i.test(stop.meta.website)) actions.createEl("a", { cls: "wf-ext", text: t("website"), attr: { href: stop.meta.website } });
    actions.createEl("a", { text: t("to_line"), attr: { href: "#", "data-wf-jump": "1" } });
    return root;
  }

  /** An arrowhead on the line, 22 px before the destination pin so the pin does not cover it. */
  private drawArrow(pts: L.LatLng[], color: string, cls: string): void {
    if (!this.map || pts.length < 2) return;
    const px = pts.map((p) => this.map!.latLngToLayerPoint(p));
    let remaining = 22;
    let i = px.length - 1;
    let tip = px[i];
    while (i > 0) {
      const seg = px[i].distanceTo(px[i - 1]);
      if (seg >= remaining) {
        const f = remaining / seg;
        tip = L.point(px[i].x + (px[i - 1].x - px[i].x) * f, px[i].y + (px[i - 1].y - px[i].y) * f);
        break;
      }
      remaining -= seg;
      i--;
      tip = px[i];
    }
    if (i === 0) return;
    const from = px[i - 1];
    const angle = (Math.atan2(tip.y - from.y, tip.x - from.x) * 180) / Math.PI;
    L.marker(this.map.layerPointToLatLng(tip), {
      icon: L.divIcon({ className: `wf-arrow ${cls}`, html: `<span style="--wf-color:${color};transform:rotate(${angle}deg)"></span>`, iconSize: [14, 14], iconAnchor: [7, 7] }),
      interactive: false,
      keyboard: false,
    }).addTo(this.layer);
  }

  private drawLegend(it: Itinerary): void {
    const all = this.legendEl.createEl("button", { cls: "wf-chip wf-chip-all", text: t("all") });
    all.toggleClass("is-active", this.activeDay === -1);
    all.onclick = () => {
      this.pinnedDay = -1;
      this.activeDay = -1;
      this.focused = null;
      this.draw();
      this.fitAll(it.stops);
    };
    for (const day of it.days) {
      const chip = this.legendEl.createEl("button", { cls: "wf-chip", text: day.label || (day.headingLine === -1 ? t("other") : t("day", { n: day.index + 1 })) });
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
    const right = this.legendEl.createDiv({ cls: "wf-legend-right" });
    const follow = right.createEl("button", { cls: "wf-chip wf-chip-icon", text: "📍" });
    follow.toggleClass("is-active", this.plugin.settings.followCursor);
    follow.setAttr("aria-label", this.plugin.settings.followCursor ? t("follow_on") : t("follow_off"));
    follow.onclick = () => {
      this.plugin.settings.followCursor = !this.plugin.settings.followCursor;
      void this.plugin.saveSettings();
      this.draw();
    };
  }

  /** The active day's stops as a vertical timeline in the left column; the whole trip when no day is active. */
  private drawStrip(it: Itinerary): void {
    const day = it.days.find((d) => d.index === this.activeDay);
    const days = day ? [day] : it.days;
    for (const d of days) {
      const color = dayColor(d.index);
      if (!day) {
        const h = this.stripEl.createDiv({ cls: "wf-strip-day", text: d.label || t("other") });
        h.style.setProperty("--wf-color", color);
      }
      const { legs, date } = this.plan(d);
      d.stops.forEach((stop, i) => {
        if (i > 0) this.drawLegRow(legs[i - 1], color);
        const card = this.stripEl.createEl("button", { cls: "wf-stop" });
        card.style.setProperty("--wf-color", color);
        card.toggleClass("is-focus", stop === this.focused);
        const photo = this.plugin.photoFor(stop);
        if (photo) {
          const th = card.createEl("img", { cls: "wf-stop-thumb", attr: { src: photo.url, alt: "", loading: "lazy" } });
          th.onerror = () => { th.remove(); card.removeClass("has-thumb"); };
          card.addClass("has-thumb");
        }
        const body = card.createDiv({ cls: "wf-stop-body" });
        const top = body.createDiv({ cls: "wf-stop-top" });
        top.createSpan({ cls: "wf-stop-n", text: String(i + 1) });
        if (stop.time) top.createSpan({ cls: "wf-stop-time", text: stop.time });
        const main = body.createDiv({ cls: "wf-stop-main" });
        main.createSpan({ cls: "wf-stop-glyph", text: stop.emoji ?? CATEGORY_EMOJI[stop.category] });
        main.createSpan({ cls: "wf-stop-name", text: stop.name });
        const warn = this.hoursWarning(stop, date);
        const notes = stopNotes(stop);
        // The chosen card is the unfolded one; choosing another folds it back. No toggles to click.
        const open = stop === this.focused;
        card.toggleClass("is-open", open);
        const sub = body.createDiv({ cls: "wf-stop-sub" });
        if (warn) sub.createSpan({ cls: "is-late", text: `⚠ ${warn}` });
        else if (notes[0]) sub.createSpan({ text: notes[0] });
        else if (stop.meta?.rating) sub.createSpan({ text: `★ ${stop.meta.rating.toFixed(1)}` });
        if (open && notes.length > 0) {
          const box = body.createDiv({ cls: "wf-stop-notes" });
          if (warn) box.createDiv({ cls: "wf-stop-note is-late", text: `⚠ ${warn}` });
          for (const n of notes) box.createDiv({ cls: "wf-stop-note", text: n });
        }
        card.draggable = true;
        card.ondragstart = (e) => { e.dataTransfer?.setData("text/plain", String(stop.line)); card.addClass("is-dragging"); };
        card.ondragend = () => card.removeClass("is-dragging");
        card.ondragover = (e) => { e.preventDefault(); card.addClass("is-drop"); };
        card.ondragleave = () => card.removeClass("is-drop");
        card.ondrop = (e) => {
          e.preventDefault();
          card.removeClass("is-drop");
          const src = Number(e.dataTransfer?.getData("text/plain"));
          if (Number.isFinite(src) && src !== stop.line) void this.plugin.moveStopLine(src, stop.line);
        };
        card.onclick = () => {
          this.focused = stop;
          this.userMoved = false;
          this.draw();
          this.flyToStop(stop);
          void this.jumpTo(stop, false);
          this.openPopup(stop);
        };
        if (stop === this.focused) window.setTimeout(() => card.scrollIntoView({ block: "nearest", behavior: "smooth" }), 0);
      });
    }
  }

  /**
   * The arrow between two cards. The transport is the user's: chosen here,
   * or a transport emoji written before the link. Until chosen, the row
   * asks, and shows the straight-line distance only.
   */
  private drawLegRow(leg: Leg, color: string): void {
    const conn = this.stripEl.createDiv({ cls: `wf-leg${leg.lateBy > 0 ? " is-late" : ""}${leg.mode ? "" : " is-unknown"}` });
    conn.style.setProperty("--wf-color", color);
    const mode = conn.createEl("a", { cls: "wf-leg-mode", text: leg.mode ? TRANSPORT_EMOJI[leg.mode] : "?" });
    mode.setAttr("aria-label", t("via_hint"));
    mode.onclick = (e) => {
      e.stopPropagation();
      this.pickTransport(mode, leg);
    };
    let text = leg.mode ? legText(leg) : `${t("pick_mode")} · ${legText(leg)}`;
    if (leg.mode && !leg.routed && routable(leg.mode) && !this.plugin.settings.googleApiKey) text += ` · ${t("key_needed")}`;
    conn.createSpan({ cls: "wf-leg-text", text });
    if (leg.lateBy) conn.createSpan({ cls: "wf-leg-late", text: t("late_by", { n: leg.lateBy }) });
    conn.setAttr("aria-label", legTooltip(leg));
  }

  private pickTransport(anchor: HTMLElement, leg: Leg): void {
    this.popover(anchor, MODES.map((m) => ({ label: `${TRANSPORT_EMOJI[m]} ${t(`m_${m}` as const)}`, active: m === leg.mode, pick: () => this.plugin.setStopTransport(leg.to, m) })));
  }

  /** A small menu anchored under an element; one click picks and closes. */
  private popover(anchor: HTMLElement, items: Array<{ label: string; active: boolean; pick: () => void }>): void {
    this.contentEl.querySelector(".wf-popover")?.remove();
    const pop = this.contentEl.createDiv({ cls: "wf-popover" });
    for (const it of items) {
      const b = pop.createEl("button", { cls: `wf-popover-item${it.active ? " is-active" : ""}`, text: it.label });
      b.onclick = (e) => { e.stopPropagation(); pop.remove(); it.pick(); };
    }
    const a = anchor.getBoundingClientRect();
    const r = this.contentEl.getBoundingClientRect();
    pop.style.left = `${Math.max(4, a.left - r.left)}px`;
    pop.style.top = `${a.bottom - r.top + 4}px`;
    const close = (e: MouseEvent) => { if (!pop.contains(e.target as Node)) { pop.remove(); document.removeEventListener("mousedown", close, true); } };
    window.setTimeout(() => document.addEventListener("mousedown", close, true), 0);
  }

  /* ---------- camera ---------- */

  /** Width of the map hidden under the floating timeline, so the camera centres on what is actually visible. */
  private leftInset(): number {
    return this.plugin.settings.listOpen ? this.plugin.settings.listWidth + 20 : 0;
  }

  /** The map centre that puts `target` in the middle of the uncovered part of the map at `zoom`. */
  private centreFor(target: L.LatLng, zoom: number): L.LatLng {
    if (!this.map) return target;
    return this.map.unproject(this.map.project(target, zoom).subtract([this.leftInset() / 2, 0]), zoom);
  }

  private hoverClose = 0;
  private lastSig = "";

  /** Closes a popup that was only open because the pointer was on the pin. */
  private closeHoverPopup(stop: Stop, marker: L.Marker): void {
    window.clearTimeout(this.hoverClose);
    this.hoverClose = window.setTimeout(() => {
      if (stop === this.focused || !marker.isPopupOpen()) return;
      marker.closePopup();
      // Hovering another pin had displaced the chosen stop's card; bring it back.
      if (this.focused) this.openPopup(this.focused);
    }, 180);
  }

  /** Opens a stop's popup, panning it clear of the floating timeline. */
  private openPopup(stop: Stop): void {
    const marker = this.markers.get(stop);
    if (!marker) return;
    const popup = marker.getPopup();
    if (popup) L.setOptions(popup, { autoPanPaddingTopLeft: L.point(this.leftInset() + 12, 12), autoPanPaddingBottomRight: L.point(12, 12) });
    marker.openPopup();
  }

  private flyToStop(stop: Stop): void {
    if (!this.map) return;
    this.map.invalidateSize(false);
    const size = this.map.getSize();
    if (size.x === 0 || size.y === 0) return;
    const target = L.latLng(stop.lat, stop.lng);
    const zoom = Math.max(this.map.getZoom(), 14);
    this.flying = true;
    const visible = this.map.getBounds();
    const covered = this.map.containerPointToLatLng([this.leftInset(), 0]);
    const seen = L.latLngBounds(L.latLng(visible.getSouth(), covered.lng), visible.getNorthEast()).pad(-0.2);
    if (seen.contains(target) && this.map.getZoom() >= 13) this.map.panTo(this.centreFor(target, this.map.getZoom()), { animate: true, duration: 0.4 });
    else this.map.flyTo(this.centreFor(target, zoom), zoom, { duration: 0.6 });
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
      this.map.setView(this.centreFor(L.latLng(stops[0].lat, stops[0].lng), 14), 14);
      return;
    }
    this.map.fitBounds(L.latLngBounds(stops.map((s) => [s.lat, s.lng] as [number, number])), { paddingTopLeft: [this.leftInset() + 36, 36], paddingBottomRight: [36, 36], maxZoom: 15 });
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

/** The point halfway along a polyline by length. */
function midpointOf(pts: L.LatLng[]): L.LatLng {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += pts[i - 1].distanceTo(pts[i]);
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = pts[i - 1].distanceTo(pts[i]);
    if (acc + seg >= total / 2) {
      const f = seg ? (total / 2 - acc) / seg : 0;
      return L.latLng(pts[i - 1].lat + (pts[i].lat - pts[i - 1].lat) * f, pts[i - 1].lng + (pts[i].lng - pts[i - 1].lng) * f);
    }
    acc += seg;
  }
  return pts[Math.floor(pts.length / 2)];
}

/** Tooltip content as a node: Leaflet would otherwise set a string as innerHTML, and names come from the note. */
function tipEl(text: string): HTMLElement {
  const el = document.createElement("span");
  el.textContent = text;
  return el;
}

function legTooltip(leg: Leg): string {
  const bits = [`${leg.mode ? TRANSPORT_EMOJI[leg.mode] + " " : ""}${leg.from.name} → ${leg.to.name}`, legText(leg)];
  if (leg.routed) bits.push("Google Routes");
  if (leg.lateBy) bits.push(t("late_vs", { t: leg.to.time ?? "", n: leg.lateBy }));
  return bits.join("\n");
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

/** Everything the pane draws from an itinerary, as a string, to skip a rebuild when nothing changed. */
function signatureOf(it: Itinerary | null): string {
  if (!it) return "";
  return JSON.stringify(it.days.map((d) => [d.headingLine, d.title, d.stops.map((s) => [s.line, s.from, s.name, s.lat, s.lng, s.transport, s.time, s.emoji, s.note, s.notes, s.meta])]));
}
