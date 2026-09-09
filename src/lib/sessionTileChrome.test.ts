import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_SESSION_COLOR,
  SESSION_COLOR_BLACK,
  SESSION_COLOR_BLACK_ACTIVE,
  SESSION_COLOR_BLACK_IDLE,
  SESSION_COLOR_WHITE,
  SESSION_COLOR_WHITE_ACTIVE,
  SESSION_WHITE_INK,
  STANDARD_COLORS_NAMED,
  sessionTileChrome,
  standardColorLabel,
} from "../components/library/sessionColors.ts";

describe("session colour palette", () => {
  it("omits White and Black, and defaults new sessions to Blue", () => {
    assert.equal(
      STANDARD_COLORS_NAMED.some((c) => c.name === "White" || c.name === "Black"),
      false,
    );
    assert.equal(STANDARD_COLORS_NAMED.some((c) => c.name === "Blue"), true);
    assert.equal(DEFAULT_SESSION_COLOR, "#3b82f6");
    assert.equal(standardColorLabel(null), "Blue");
  });

  it("styles White tiles with a grey rail and grey type on a white fill", () => {
    const chrome = sessionTileChrome(SESSION_COLOR_WHITE, false);
    assert.equal(chrome.fill, SESSION_COLOR_WHITE);
    assert.equal(chrome.fg, SESSION_WHITE_INK);
    assert.equal(chrome.bar, SESSION_WHITE_INK);
  });

  it("styles White tiles with a grey fill, white type, and white rail on click", () => {
    const chrome = sessionTileChrome(SESSION_COLOR_WHITE, true);
    assert.equal(chrome.fill, SESSION_COLOR_WHITE_ACTIVE);
    assert.equal(chrome.fill, SESSION_WHITE_INK);
    assert.equal(chrome.fg, "#ffffff");
    assert.equal(chrome.bar, "#ffffff");
  });

  it("styles Black tiles with a lighter rest fill and a darker charcoal on click", () => {
    const rest = sessionTileChrome(SESSION_COLOR_BLACK, false);
    const active = sessionTileChrome(SESSION_COLOR_BLACK, true);
    assert.equal(rest.fill, SESSION_COLOR_BLACK_IDLE);
    assert.equal(active.fill, SESSION_COLOR_BLACK_ACTIVE);
    assert.notEqual(active.fill, SESSION_COLOR_BLACK);
    assert.notEqual(rest.fill, "#000000");
    assert.equal(rest.fg, "#ffffff");
    assert.equal(rest.bar, "#ffffff");
    assert.equal(active.fg, "#ffffff");
    assert.equal(active.bar, "#ffffff");
  });
});
