import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import type { Editor } from "obsidian";
import { isGoogleMapsUrl } from "../core/gmaps-url";
import { CATEGORY_EMOJI, pickCategory } from "../core/category";
import { formatStop, type PlaceMeta } from "../core/itinerary";
import type { ResolvedPlace } from "../core/resolve";
import { todayHours } from "./map-view";

/** Finds a Google Maps URL in a line, returning its character span. */
export function findMapsUrl(line: string): { url: string; from: number; to: number } | null {
  const re = /https?:\/\/\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const url = m[0].replace(/[),.;!?]+$/, "");
    if (isGoogleMapsUrl(url)) return { url, from: m.index, to: m.index + url.length };
  }
  return null;
}

/** The line should be replaced in place; returns the new text for the span. */
export function stopText(place: ResolvedPlace, withEmoji = true): string {
  const cat = pickCategory({ googleType: place.meta?.type, name: place.name });
  const emoji = withEmoji && cat !== "place" ? CATEGORY_EMOJI[cat] : undefined;
  return formatStop(place.name, place.lat, place.lng, place.meta, emoji);
}

/**
 * Swaps the URL on `line` for the resolved stop if the URL is still there.
 * The user may have kept typing while the network call ran, so we search the
 * current line text again rather than trusting the original offsets.
 */
export function replaceUrlInEditor(editor: Editor, line: number, url: string, replacement: string): boolean {
  const search = (ln: number): boolean => {
    if (ln < 0 || ln >= editor.lineCount()) return false;
    const text = editor.getLine(ln);
    const idx = text.indexOf(url);
    if (idx === -1) return false;
    editor.replaceRange(replacement, { line: ln, ch: idx }, { line: ln, ch: idx + url.length });
    return true;
  };
  return search(line) || search(line + 1) || search(line - 1);
}

/* ---------- Live Preview decorations ---------- */

const META_RE = /\[([^\]]*)\]\(geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)[^)]*\)(\s*%%wf:(\{.*?\})%%)/g;

class MetaWidget extends WidgetType {
  constructor(private meta: PlaceMeta) {
    super();
  }
  eq(other: MetaWidget): boolean {
    return JSON.stringify(other.meta) === JSON.stringify(this.meta);
  }
  toDOM(): HTMLElement {
    const el = document.createElement("span");
    el.className = "wf-meta";
    const bits: string[] = [];
    if (this.meta.rating) bits.push(`★ ${this.meta.rating.toFixed(1)}`);
    const today = todayHours(this.meta.hours);
    if (today) bits.push(today.replace(/^[^:]+:\s*/, ""));
    el.textContent = bits.join(" · ");
    if (!bits.length) el.className = "wf-meta wf-meta-empty";
    if (this.meta.hours?.length || this.meta.address) {
      el.title = [this.meta.address, ...(this.meta.hours ?? [])].filter(Boolean).join("\n");
    }
    return el;
  }
  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * Hides the `%%wf:{...}%%` metadata comment and shows a compact
 * "★ 4.5 · 9:00 AM – 5:00 PM" chip in its place, except on the line being
 * edited so the raw text stays reachable.
 */
export const metaDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(u: ViewUpdate): void {
      if (u.docChanged || u.viewportChanged || u.selectionSet) this.decorations = this.build(u.view);
    }
    build(view: EditorView): DecorationSet {
      const b = new RangeSetBuilder<Decoration>();
      const cursorLine = view.state.doc.lineAt(view.state.selection.main.head).number;
      for (const { from, to } of view.visibleRanges) {
        const text = view.state.doc.sliceString(from, to);
        META_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = META_RE.exec(text))) {
          const start = from + m.index + m[0].length - m[4].length;
          const end = from + m.index + m[0].length;
          if (view.state.doc.lineAt(start).number === cursorLine) continue;
          let meta: PlaceMeta;
          try {
            meta = JSON.parse(m[5]) as PlaceMeta;
          } catch {
            continue;
          }
          b.add(start, end, Decoration.replace({ widget: new MetaWidget(meta) }));
        }
      }
      return b.finish();
    }
  },
  { decorations: (v) => v.decorations },
);
