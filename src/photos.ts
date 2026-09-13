import type { Stop } from "./core/itinerary";
import { googlePhotoUrl } from "./net";
import type { WayfarerSettings } from "./settings";

export interface StopPhoto {
  url: string;
  /** Where it came from, for the caption. Empty for the user's own image. */
  credit: string;
}

/**
 * The picture for a stop: an image the user put on the line or under it
 * (vault file or URL), else Google's place photo when a key is set and the
 * stop was resolved through Google. Nothing is searched for.
 */
export function photoFor(stop: Stop, settings: WayfarerSettings, resolveVaultImage: (link: string) => string | null): StopPhoto | null {
  if (stop.image) {
    const url = /^https?:\/\//.test(stop.image) ? stop.image : resolveVaultImage(stop.image);
    if (url) return { url, credit: "" };
  }
  if (stop.meta?.photo && settings.googleApiKey) return { url: googlePhotoUrl(settings.googleApiKey, stop.meta.photo), credit: "Google" };
  return null;
}
