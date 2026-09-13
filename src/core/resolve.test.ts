import { describe, expect, it, vi } from "vitest";
import { ResolveError, resolveMapsUrl, type ResolvedPlace } from "./resolve";

const place = (name: string): ResolvedPlace => ({ name, lat: 1, lng: 2, source: "places", meta: { rating: 4.2 } });

describe("resolveMapsUrl", () => {
  it("uses coordinates straight from the URL when there is no API key", async () => {
    const r = await resolveMapsUrl("https://www.google.com/maps/place/Senkoji+Temple/@34.409,133.205,17z", {});
    expect(r).toEqual({ name: "Senkoji Temple", lat: 34.409, lng: 133.205, source: "url" });
  });
  it("expands short links with a non-browser fetch first", async () => {
    const expand = vi.fn(async () => "https://www.google.com/maps/search/5.811698,+-55.118891?entry=tts");
    const r = await resolveMapsUrl("https://maps.app.goo.gl/TvPZdQo9HRmnfb4d8", { expandShortUrl: expand });
    expect(expand).toHaveBeenCalledWith("https://maps.app.goo.gl/TvPZdQo9HRmnfb4d8");
    expect(r).toMatchObject({ lat: 5.811698, lng: -55.118891, source: "url" });
  });
  it("refuses short links where expansion is unavailable", async () => {
    await expect(resolveMapsUrl("https://maps.app.goo.gl/x", {})).rejects.toBeInstanceOf(ResolveError);
  });
  it("prefers Places details by id, then text search, over URL coordinates", async () => {
    const details = vi.fn(async () => place("By id"));
    const searchText = vi.fn(async () => place("By text"));
    const r1 = await resolveMapsUrl("https://www.google.com/maps/search/?api=1&query=Sydney&query_place_id=ChIJabc", { places: { details, searchText } });
    expect(r1.name).toBe("By id");
    expect(searchText).not.toHaveBeenCalled();
    const near = vi.fn(async () => ({ ...place("By text"), lat: 34.41, lng: 133.206 }));
    const r2 = await resolveMapsUrl("https://www.google.com/maps/place/Senkoji+Temple/@34.409,133.205,17z", { places: { details, searchText: near } });
    expect(r2.name).toBe("By text");
    expect(near).toHaveBeenCalledWith("Senkoji Temple");
  });
  it("keeps the link's own pin when the text search lands somewhere else", async () => {
    const far = vi.fn(async () => ({ ...place("Another branch"), lat: 35.68, lng: 139.76 }));
    const r = await resolveMapsUrl("https://www.google.com/maps/place/Senkoji+Temple/@34.409,133.205,17z", { places: { details: async () => null, searchText: far } });
    expect(r).toEqual({ name: "Senkoji Temple", lat: 34.409, lng: 133.205, source: "url" });
  });
  it("falls back to URL coordinates when Places finds nothing", async () => {
    const places = { details: async () => null, searchText: async () => null };
    const r = await resolveMapsUrl("https://www.google.com/maps/place/X/@34.409,133.205,17z", { places });
    expect(r).toMatchObject({ name: "X", source: "url" });
  });
  it("geocodes text queries with Nominatim when there is no key", async () => {
    const nominatim = vi.fn(async () => ({ name: "一蘭 渋谷", lat: 35.66, lng: 139.7, source: "nominatim" as const }));
    const r = await resolveMapsUrl("https://maps.google.com/?q=Ichiran+Ramen+Shibuya", { nominatim });
    expect(nominatim).toHaveBeenCalledWith("Ichiran Ramen Shibuya");
    expect(r.name).toBe("一蘭 渋谷");
  });
  it("explains an id-only link without a key", async () => {
    await expect(resolveMapsUrl("https://www.google.com/maps/place/?q=place_id:ChIJabc", {})).rejects.toThrow(/API key/);
  });
  it("rejects non-maps input", async () => {
    await expect(resolveMapsUrl("https://example.com", {})).rejects.toThrow(/Not a Google Maps/);
  });
});
