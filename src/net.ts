/**
 * Network adapters for the resolver. Kept out of `core` because they touch
 * Obsidian's requestUrl and, on desktop, Node's https module.
 */
import { Platform, requestUrl } from "obsidian";
import type { ResolveDeps, ResolvedPlace } from "./core/resolve";

const UA = "ObsidianItineraryMap/0.1 (+https://github.com/kevinsslin/obsidian-itinerary-map)";

/**
 * maps.app.goo.gl answers a browser User-Agent with a 200 interstitial page
 * and only hands the Location header to non-browser clients, and Obsidian's
 * requestUrl follows redirects silently, so on desktop we use Node's https
 * with our own UA and walk the redirects ourselves.
 */
export async function expandShortUrl(url: string, maxHops = 5): Promise<string> {
  if (!Platform.isDesktopApp) throw new Error("Short link expansion needs the desktop app");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const https = require("node:https") as typeof import("node:https");
  let current = url;
  for (let i = 0; i < maxHops; i++) {
    const location = await new Promise<string | null>((resolve, reject) => {
      const req = https.request(current, { method: "GET", headers: { "User-Agent": UA, Accept: "*/*" } }, (res) => {
        res.resume();
        const loc = res.headers.location;
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && loc) resolve(new URL(loc, current).href);
        else resolve(null);
      });
      req.setTimeout(8000, () => req.destroy(new Error("Timed out expanding short link")));
      req.on("error", reject);
      req.end();
    });
    if (!location) return current;
    current = location;
    if (!/goo\.gl|g\.co/.test(new URL(current).hostname)) return current;
  }
  return current;
}

export async function nominatim(query: string): Promise<ResolvedPlace | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
  const res = await requestUrl({ url, headers: { "User-Agent": UA, Accept: "application/json" }, throw: false });
  if (res.status !== 200) return null;
  const hit = (res.json as Array<{ lat: string; lon: string; name?: string; display_name?: string }>)[0];
  if (!hit) return null;
  return {
    name: hit.name || query,
    lat: Number(hit.lat),
    lng: Number(hit.lon),
    meta: hit.display_name ? { address: hit.display_name } : undefined,
    source: "nominatim",
  };
}

const PLACE_FIELDS = "id,displayName,location,formattedAddress,rating,regularOpeningHours,websiteUri";

interface PlaceJson {
  id?: string;
  displayName?: { text?: string };
  location?: { latitude: number; longitude: number };
  formattedAddress?: string;
  rating?: number;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  websiteUri?: string;
}

export function googlePlaces(apiKey: string, languageCode: string): NonNullable<ResolveDeps["places"]> {
  const headers = { "X-Goog-Api-Key": apiKey, "Content-Type": "application/json" };
  const toPlace = (p: PlaceJson | undefined): ResolvedPlace | null => {
    if (!p?.location || !p.displayName?.text) return null;
    return {
      name: p.displayName.text,
      lat: p.location.latitude,
      lng: p.location.longitude,
      source: "places",
      meta: {
        rating: p.rating,
        hours: p.regularOpeningHours?.weekdayDescriptions,
        address: p.formattedAddress,
        website: p.websiteUri,
        placeId: p.id,
      },
    };
  };
  return {
    async details(placeId) {
      const res = await requestUrl({
        url: `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=${languageCode}`,
        headers: { ...headers, "X-Goog-FieldMask": PLACE_FIELDS },
        throw: false,
      });
      return res.status === 200 ? toPlace(res.json as PlaceJson) : null;
    },
    async searchText(query) {
      const res = await requestUrl({
        url: "https://places.googleapis.com/v1/places:searchText",
        method: "POST",
        headers: { ...headers, "X-Goog-FieldMask": PLACE_FIELDS.split(",").map((f) => `places.${f}`).join(",") },
        body: JSON.stringify({ textQuery: query, languageCode, pageSize: 1 }),
        throw: false,
      });
      if (res.status !== 200) return null;
      return toPlace((res.json as { places?: PlaceJson[] }).places?.[0]);
    },
  };
}
