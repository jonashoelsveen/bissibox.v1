import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  googleMapsHrefForLocation,
  googleMapsSearchUrl,
  parseLatLngFromMapsUrl,
} from "./googleMapsUrl.ts";

describe("googleMapsSearchUrl", () => {
  it("searches by place name so Maps shows the place, not coordinates", () => {
    const href = googleMapsSearchUrl({
      query: "Frogner stadion, Oslo",
      lat: 59.9275,
      lng: 10.7062,
    });
    const u = new URL(href);
    assert.equal(u.searchParams.get("api"), "1");
    assert.equal(u.searchParams.get("query"), "Frogner stadion, Oslo");
    assert.equal(u.searchParams.get("ll"), "59.9275,10.7062");
    assert.doesNotMatch(u.searchParams.get("query") ?? "", /^-?\d/);
  });

  it("falls back to coordinates when there is no place name", () => {
    const href = googleMapsSearchUrl({ lat: 59.91, lng: 10.75 });
    const u = new URL(href);
    assert.equal(u.searchParams.get("query"), "59.91,10.75");
    assert.equal(u.searchParams.get("ll"), null);
  });
});

describe("parseLatLngFromMapsUrl", () => {
  it("reads the legacy query=lat,lng format", () => {
    assert.deepEqual(
      parseLatLngFromMapsUrl("https://www.google.com/maps/search/?api=1&query=59.91,10.75"),
      { lat: 59.91, lng: 10.75 },
    );
  });

  it("reads ll= from name-based search URLs", () => {
    const href = googleMapsSearchUrl({
      query: "Oslo Spektrum",
      lat: 59.9127,
      lng: 10.7545,
    });
    assert.deepEqual(parseLatLngFromMapsUrl(href), { lat: 59.9127, lng: 10.7545 });
  });
});

describe("googleMapsHrefForLocation", () => {
  it("does not link when no map URL was saved", () => {
    assert.equal(googleMapsHrefForLocation("Oslo", null), "");
    assert.equal(googleMapsHrefForLocation("Oslo", "   "), "");
  });

  it("rewrites a stored coordinate URL using the displayed place name", () => {
    const href = googleMapsHrefForLocation(
      "Bislett Stadion",
      "https://www.google.com/maps/search/?api=1&query=59.9253,10.7334",
    );
    const u = new URL(href);
    assert.equal(u.searchParams.get("query"), "Bislett Stadion");
    assert.equal(u.searchParams.get("ll"), "59.9253,10.7334");
  });
});
