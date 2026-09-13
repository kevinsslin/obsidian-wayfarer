/**
 * Network adapters for the resolver. Kept out of `core` because they touch
 * Obsidian's requestUrl and, on desktop, Node's https module.
 */
import { Platform, requestUrl } from "obsidian";
import type { ResolveDeps, ResolvedPlace } from "./core/resolve";

const UA = "ObsidianWayfarer/0.1 (+https://github.com/kevinsslin/obsidian-wayfarer)";

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

const PLACE_FIELDS = "id,displayName,location,formattedAddress,rating,regularOpeningHours,websiteUri,primaryType,photos";

interface PlaceJson {
  id?: string;
  displayName?: { text?: string };
  location?: { latitude: number; longitude: number };
  formattedAddress?: string;
  rating?: number;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  websiteUri?: string;
  primaryType?: string;
  photos?: Array<{ name: string }>;
}

/** URL for a Google photo resource. Built only for the DOM; the key never goes into a note. */
export function googlePhotoUrl(apiKey: string, photo: string, maxWidthPx = 480): string {
  return `https://places.googleapis.com/v1/${photo}/media?maxWidthPx=${maxWidthPx}&key=${encodeURIComponent(apiKey)}`;
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
        type: p.primaryType,
        photo: p.photos?.[0]?.name,
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

/* ---------- routing ---------- */

export interface RouteResult {
  distanceM: number;
  durationS: number;
  geometry: [number, number][];
  summary?: string;
}

/**
 * Public OSRM demo server. It answers every profile with car routing, so
 * only the geometry and distance are trusted; walking and cycling durations
 * are derived from the distance by the caller.
 */
export async function osrmRoute(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<RouteResult | null> {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  const res = await requestUrl({ url, headers: { "User-Agent": UA }, throw: false });
  if (res.status !== 200) return null;
  const route = (res.json as { code?: string; routes?: Array<{ distance: number; duration: number; geometry: { coordinates: [number, number][] } }> }).routes?.[0];
  if (!route) return null;
  return { distanceM: route.distance, durationS: route.duration, geometry: route.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]) };
}

/**
 * Google Routes API (New). Transit needs a departure time in the future;
 * the caller passes the day's date and the stop's time when it has them.
 */
export async function googleRoute(
  apiKey: string,
  languageCode: string,
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  mode: "TRANSIT" | "WALK" | "DRIVE" | "BICYCLE",
  departure?: Date,
): Promise<RouteResult | null> {
  const body: Record<string, unknown> = {
    origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
    destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
    travelMode: mode,
    languageCode,
  };
  if (mode === "TRANSIT" && departure && departure.getTime() > Date.now()) body.departureTime = departure.toISOString();
  const res = await requestUrl({
    url: "https://routes.googleapis.com/directions/v2:computeRoutes",
    method: "POST",
    headers: {
      "X-Goog-Api-Key": apiKey,
      "Content-Type": "application/json",
      "X-Goog-FieldMask":
        "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps.travelMode,routes.legs.steps.transitDetails.transitLine.nameShort,routes.legs.steps.transitDetails.transitLine.name",
    },
    body: JSON.stringify(body),
    throw: false,
  });
  if (res.status !== 200) return null;
  interface Step { travelMode?: string; transitDetails?: { transitLine?: { nameShort?: string; name?: string } } }
  const route = (res.json as { routes?: Array<{ duration?: string; distanceMeters?: number; polyline?: { encodedPolyline?: string }; legs?: Array<{ steps?: Step[] }> }> }).routes?.[0];
  if (!route?.polyline?.encodedPolyline) return null;
  const { decodePolyline } = await import("./core/legs");
  const lines = (route.legs ?? []).flatMap((l) => l.steps ?? []).map((s) => s.transitDetails?.transitLine?.nameShort || s.transitDetails?.transitLine?.name).filter((x): x is string => !!x);
  return {
    distanceM: route.distanceMeters ?? 0,
    durationS: Number.parseInt(route.duration ?? "0", 10),
    geometry: decodePolyline(route.polyline.encodedPolyline),
    summary: lines.length ? Array.from(new Set(lines)).join(" → ") : undefined,
  };
}

/* ---------- photos without a key ---------- */

export interface FoundPhoto {
  url: string;
  /** Article or file title, for attribution. */
  title: string;
  source: "wikipedia" | "commons";
}

interface WikiPage { title: string; missing?: string; thumbnail?: { source: string } }

async function wikiQuery(host: string, params: Record<string, string>): Promise<WikiPage[]> {
  const q = new URLSearchParams({ action: "query", format: "json", origin: "*", ...params });
  const res = await requestUrl({ url: `https://${host}/w/api.php?${q.toString()}`, headers: { "User-Agent": UA }, throw: false });
  if (res.status !== 200) return [];
  const pages = (res.json as { query?: { pages?: Record<string, WikiPage> } }).query?.pages;
  return pages ? Object.values(pages) : [];
}

/** The article's lead image when a Wikipedia in one of `langs` has an article titled like the stop. */
export async function wikipediaByTitle(name: string, langs: string[]): Promise<FoundPhoto | null> {
  for (const lang of langs) {
    const pages = await wikiQuery(`${lang}.wikipedia.org`, { titles: name, redirects: "1", prop: "pageimages", piprop: "thumbnail", pithumbsize: "640" });
    const hit = pages.find((p) => !p.missing && p.thumbnail);
    if (hit?.thumbnail) return { url: hit.thumbnail.source, title: hit.title, source: "wikipedia" };
  }
  return null;
}

/** The nearest Wikipedia article with an image, within `radiusM`. */
export async function wikipediaNearby(lat: number, lng: number, langs: string[], radiusM = 400): Promise<FoundPhoto | null> {
  for (const lang of langs) {
    const pages = await wikiQuery(`${lang}.wikipedia.org`, {
      generator: "geosearch", ggscoord: `${lat}|${lng}`, ggsradius: String(radiusM), ggslimit: "5",
      prop: "pageimages", piprop: "thumbnail", pithumbsize: "640",
    });
    const hit = pages.find((p) => p.thumbnail);
    if (hit?.thumbnail) return { url: hit.thumbnail.source, title: hit.title, source: "wikipedia" };
  }
  return null;
}

/** The nearest photo on Wikimedia Commons, within `radiusM`. Street scenes are common; last resort. */
export async function commonsNearby(lat: number, lng: number, radiusM = 120): Promise<FoundPhoto | null> {
  const q = new URLSearchParams({
    action: "query", format: "json", origin: "*", generator: "geosearch", ggscoord: `${lat}|${lng}`, ggsradius: String(radiusM),
    ggsnamespace: "6", ggslimit: "5", prop: "imageinfo", iiprop: "url|mime", iiurlwidth: "640",
  });
  const res = await requestUrl({ url: `https://commons.wikimedia.org/w/api.php?${q.toString()}`, headers: { "User-Agent": UA }, throw: false });
  if (res.status !== 200) return null;
  const pages = (res.json as { query?: { pages?: Record<string, { title: string; imageinfo?: Array<{ thumburl?: string; mime?: string }> }> } }).query?.pages;
  const hit = pages && Object.values(pages).find((p) => p.imageinfo?.[0]?.mime === "image/jpeg" && p.imageinfo[0].thumburl);
  return hit ? { url: hit.imageinfo![0].thumburl!, title: hit.title.replace(/^File:/, ""), source: "commons" } : null;
}
