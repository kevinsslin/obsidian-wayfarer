import type { Stop } from "./core/itinerary";
import { commonsNearby, googlePhotoUrl, wikipediaByTitle, wikipediaNearby, type FoundPhoto } from "./net";
import type { WayfarerSettings } from "./settings";

export interface StopPhoto {
  url: string;
  /** Where it came from, for the caption. */
  credit: string;
}

/**
 * Finds a picture for a stop without the user pasting one. Order: the
 * image on the stop's line, Google Places (when a key is set and the stop
 * has a photo reference), a Wikipedia article titled like the stop, the
 * nearest Wikipedia article with a lead image, the nearest Commons photo.
 * Results, including misses, are cached and persisted by the plugin.
 */
export class PhotoFinder {
  private inflight = new Set<string>();

  constructor(
    private settings: () => WayfarerSettings,
    private cache: Record<string, FoundPhoto | null>,
    private onUpdate: () => void,
    private persist: () => void,
    private resolveVaultImage: (link: string) => string | null,
  ) {}

  /** Synchronous answer from what is known now; kicks off a lookup when needed. */
  get(stop: Stop): StopPhoto | null {
    if (stop.image) {
      const url = /^https?:\/\//.test(stop.image) ? stop.image : this.resolveVaultImage(stop.image);
      if (url) return { url, credit: "" };
    }
    const s = this.settings();
    if (stop.meta?.photo && s.googleApiKey) return { url: googlePhotoUrl(s.googleApiKey, stop.meta.photo), credit: "Google" };
    if (!s.autoPhotos) return null;
    const key = photoKey(stop);
    if (key in this.cache) {
      const hit = this.cache[key];
      return hit ? { url: hit.url, credit: hit.source === "wikipedia" ? `Wikipedia: ${hit.title}` : `Wikimedia Commons: ${hit.title}` } : null;
    }
    if (!this.inflight.has(key)) void this.lookup(key, stop);
    return null;
  }

  private async lookup(key: string, stop: Stop): Promise<void> {
    this.inflight.add(key);
    try {
      const langs = Array.from(new Set([this.settings().languageCode.split("-")[0], ...guessLangs(stop), "en"]));
      // A nearby article's photo suits a waterfall or a shrine; for a hotel or a
      // restaurant it would show the wrong thing, so those get a title match or a street photo only.
      const landmark = LANDMARK_CATEGORIES.has(stop.category);
      const found =
        (await wikipediaByTitle(cleanName(stop.name), langs)) ??
        (landmark ? await wikipediaNearby(stop.lat, stop.lng, langs) : null) ??
        (await commonsNearby(stop.lat, stop.lng, landmark ? 200 : 80));
      this.cache[key] = found;
      this.persist();
      if (found) this.onUpdate();
    } catch {
      /* try again next session */
    } finally {
      this.inflight.delete(key);
    }
  }
}

const LANDMARK_CATEGORIES = new Set(["nature", "view", "park", "shrine", "temple", "castle", "museum", "station", "airport", "port", "event", "place"]);

export function photoKey(stop: Stop): string {
  return `${stop.lat.toFixed(4)},${stop.lng.toFixed(4)}:${cleanName(stop.name)}`;
}

/** Drops a trailing romanisation or note in brackets: "湯滝（Yudaki）" → "湯滝". */
function cleanName(name: string): string {
  return name.replace(/\s*[（(].*?[）)]\s*$/, "").trim();
}

/** Wikipedias worth asking, from the script of the name and the location. */
function guessLangs(stop: Stop): string[] {
  const out: string[] = [];
  if (/[぀-ヿ]/.test(stop.name)) out.push("ja");
  if (/[一-鿿]/.test(stop.name)) out.push(stop.lat > 20 && stop.lat < 46 && stop.lng > 122 && stop.lng < 154 ? "ja" : "zh", "zh", "ja");
  if (/[가-힯]/.test(stop.name)) out.push("ko");
  if (/[฀-๿]/.test(stop.name)) out.push("th");
  return out;
}
