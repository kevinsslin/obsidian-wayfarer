/**
 * Network adapters for the resolver. Kept out of `core` because they touch
 * Obsidian's requestUrl and, on desktop, Node's https module.
 */
import { Platform, requestUrl } from "obsidian";
import type { ResolveDeps, ResolvedPlace } from "./core/resolve";

const UA = "ObsidianWayfarer/0.1 (+https://github.com/kevinsslin/wayfarer)";

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

const PLACE_FIELDS = "id,displayName,location,formattedAddress,rating,regularOpeningHours,websiteUri,primaryType,photos,utcOffsetMinutes";

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
  utcOffsetMinutes?: number;
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
        utc: p.utcOffsetMinutes,
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
      refused(res);
      return toPlace(res.json as PlaceJson);
    },
    async searchText(query, near) {
      const body: Record<string, unknown> = { textQuery: query, languageCode, pageSize: 1 };
      if (near) body.locationBias = { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 2000 } };
      const res = await requestUrl({
        url: "https://places.googleapis.com/v1/places:searchText",
        method: "POST",
        headers: { ...headers, "X-Goog-FieldMask": PLACE_FIELDS.split(",").map((f) => `places.${f}`).join(",") },
        body: JSON.stringify(body),
        throw: false,
      });
      refused(res);
      return toPlace((res.json as { places?: PlaceJson[] }).places?.[0]);
    },
  };
}

/** A refusal from Google with its own explanation, e.g. an API not enabled on the key's project. */
export class GoogleApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Throws when Google refused the request (4xx/5xx), with Google's message. */
function refused(res: { status: number; json?: unknown; text?: string }): void {
  if (res.status === 200) return;
  let msg = "";
  try {
    msg = (res.json as { error?: { message?: string } })?.error?.message ?? "";
  } catch {
    msg = "";
  }
  throw new GoogleApiError(res.status, msg || `HTTP ${res.status}`);
}

/* ---------- routing ---------- */

export interface RouteResult {
  distanceM: number;
  durationS: number;
  geometry: [number, number][];
  summary?: string;
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
  refused(res);
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
