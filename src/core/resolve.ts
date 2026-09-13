/**
 * Turns a pasted Google Maps URL into a named coordinate, using whichever
 * network dependencies are available. Pure orchestration: every I/O step is
 * injected so this can be tested with fakes.
 */
import { isValidLatLng, parseGoogleMapsUrl, type ParsedMapsUrl } from "./gmaps-url";
import type { PlaceMeta } from "./itinerary";

export interface ResolvedPlace {
  name: string;
  lat: number;
  lng: number;
  meta?: PlaceMeta;
  /** Which step produced the coordinates, for the status message. */
  source: "url" | "places" | "nominatim";
}

export interface ResolveDeps {
  /** Follows redirects of a short link and returns the final URL. Undefined where unsupported (mobile). */
  expandShortUrl?: (url: string) => Promise<string>;
  /** Google Places (New) lookups. Undefined when no API key is configured. */
  places?: {
    details(placeId: string): Promise<ResolvedPlace | null>;
    searchText(query: string): Promise<ResolvedPlace | null>;
  };
  /** Free OSM geocoder fallback. */
  nominatim?: (query: string) => Promise<ResolvedPlace | null>;
}

export class ResolveError extends Error {}

export async function resolveMapsUrl(input: string, deps: ResolveDeps): Promise<ResolvedPlace> {
  let parsed = parseGoogleMapsUrl(input);
  if (!parsed) throw new ResolveError("Not a Google Maps link");

  let expanded = input;
  if (parsed.isShort) {
    if (!deps.expandShortUrl) throw new ResolveError("Short links need the desktop app. Paste the full Google Maps link instead.");
    expanded = await deps.expandShortUrl(input);
    parsed = parseGoogleMapsUrl(expanded);
    if (!parsed || parsed.isShort) throw new ResolveError("Could not expand the short link");
  }

  // With a key we prefer the API even when the URL has coordinates: it gives
  // the exact pin, the canonical name, and opening hours.
  if (deps.places) {
    if (parsed.placeId) {
      const p = await deps.places.details(parsed.placeId);
      if (p) return p;
    }
    const text = parsed.name ?? parsed.query;
    if (text) {
      const p = await deps.places.searchText(text);
      if (p) return p;
    }
  }

  if (parsed.lat !== undefined && parsed.lng !== undefined && isValidLatLng(parsed.lat, parsed.lng)) {
    return { name: nameFor(parsed), lat: parsed.lat, lng: parsed.lng, source: "url" };
  }

  const text = parsed.name ?? parsed.query;
  if (text && deps.nominatim) {
    const p = await deps.nominatim(text);
    if (p) return p;
  }

  throw new ResolveError(
    parsed.placeId || parsed.ftid
      ? "This link only carries a place id. Add a Google Places API key in settings to resolve it."
      : "No coordinates or place name found in the link",
  );
}

function nameFor(p: ParsedMapsUrl): string {
  return p.name ?? p.query ?? `${p.lat!.toFixed(4)}, ${p.lng!.toFixed(4)}`;
}
