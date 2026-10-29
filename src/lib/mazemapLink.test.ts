import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { refineMazemapHref } from "./mazemapLink.ts";

function params(href: string): URLSearchParams {
  return new URL(href).searchParams;
}

describe("refineMazemapHref", () => {
  it("keeps a numeric POI and a coordinate point", () => {
    const poi = "https://use.mazemap.com/?campusid=1&desttype=poi&dest=593";
    assert.equal(refineMazemapHref(poi, "Realfagbygget R1"), poi);
    const point = "https://use.mazemap.com/?campusid=1&desttype=point&dest=10.4026794,63.4183615,0";
    assert.equal(refineMazemapHref(point, "Bench"), point);
  });

  it("opens a known room name as that room's facility identifier", () => {
    const href = refineMazemapHref(
      "https://use.mazemap.com/#v=1&campusid=1&dest=R1",
      "Realfagbygget R1",
    );
    const query = params(href);
    assert.equal(query.get("sharepoitype"), "identifier");
    assert.equal(query.get("sharepoi"), "360-CU1-101");
    assert.equal(query.get("dest"), null);
    assert.equal(query.get("campusid"), "1");
    assert.equal(query.get("campuses"), "ntnu");
  });

  it("normalizes a dotted facility id instead of leaving an untyped destination", () => {
    const href = refineMazemapHref(
      "https://use.mazemap.com/?campusid=1&dest=360.CU1.101",
      "Realfagbygget R1",
    );
    assert.equal(params(href).get("sharepoi"), "360-CU1-101");
    assert.equal(params(href).get("dest"), null);
  });

  it("searches by the location name when the destination is not a room id", () => {
    const href = refineMazemapHref(
      "https://use.mazemap.com/?campusid=18&dest=Unknown%20hall",
      "Unknown hall",
    );
    const query = params(href);
    assert.equal(query.get("search"), "Unknown hall");
    assert.equal(query.get("dest"), null);
    assert.equal(query.get("campusid"), "18");
  });

  it("leaves a short MazeMap link that has no destination", () => {
    const href = "https://use.mazemap.com/go/1";
    assert.equal(refineMazemapHref(href, "Library"), href);
  });
});
