import { requestUrl } from "obsidian";
import type { Stop } from "./core/itinerary";
import { googlePhotoUrl } from "./net";
import type { WayfarerSettings } from "./settings";

export interface StopPhoto {
  /** Ready to put in an `img`, or absent while `pending` resolves. */
  url?: string;
  /** Resolves to an object URL, or null when Google had no picture. */
  pending?: Promise<string | null>;
  /** Where it came from, for the caption. Empty for the user's own image. */
  credit: string;
}

/**
 * Google place photos, downloaded once per session per photo and kept as
 * object URLs. Every card and popup shares one copy, so redrawing the pane
 * costs no Place Photo request, and the key never appears in the DOM.
 */
export class PhotoCache {
  private urls = new Map<string, Promise<string | null>>();

  constructor(private apiKey: () => string) {}

  get(photo: string): Promise<string | null> {
    let p = this.urls.get(photo);
    if (!p) {
      p = this.load(photo);
      this.urls.set(photo, p);
    }
    return p;
  }

  private async load(photo: string): Promise<string | null> {
    try {
      const res = await requestUrl({ url: googlePhotoUrl(this.apiKey(), photo), throw: false });
      if (res.status !== 200) {
        // Not a picture; forget it so a later session (or a fixed key) can try again.
        this.urls.delete(photo);
        return null;
      }
      const type = res.headers["content-type"] ?? "image/jpeg";
      return URL.createObjectURL(new Blob([res.arrayBuffer], { type }));
    } catch {
      this.urls.delete(photo);
      return null;
    }
  }

  clear(): void {
    for (const p of this.urls.values()) void p.then((u) => { if (u) URL.revokeObjectURL(u); });
    this.urls.clear();
  }
}

/**
 * The picture for a stop: an image the user put on the line or under it
 * (vault file or URL), else Google's place photo when a key is set and the
 * stop was resolved through Google. Nothing is searched for.
 */
export function photoFor(stop: Stop, settings: WayfarerSettings, cache: PhotoCache, resolveVaultImage: (link: string) => string | null): StopPhoto | null {
  if (stop.image) {
    const url = /^https?:\/\//.test(stop.image) ? stop.image : resolveVaultImage(stop.image);
    if (url) return { url, credit: "" };
  }
  if (stop.meta?.photo && settings.googleApiKey) return { pending: cache.get(stop.meta.photo), credit: "Google" };
  return null;
}

/** Puts the photo into `img` when it is ready; calls `gone` when there is none. */
export function attachPhoto(img: HTMLImageElement, photo: StopPhoto, gone: () => void): void {
  img.onerror = gone;
  if (photo.url) { img.src = photo.url; return; }
  void photo.pending?.then((u) => {
    if (!img.isConnected && !u) return;
    if (u) img.src = u;
    else gone();
  });
}
