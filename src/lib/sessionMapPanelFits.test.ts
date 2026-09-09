import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  SESSION_CARD_WIDTH_PX,
  SESSION_PANEL_GAP_PX,
  SESSION_PANEL_VIEWPORT_MARGIN,
  clampSessionPanelPosition,
  sessionMapPanelFitsBesideMenu,
} from "../components/calendar/sessionPanelDockUtils.ts";
import { computePopoverPosition } from "../components/calendar/popoverPosition.ts";

const NEED =
  SESSION_CARD_WIDTH_PX + SESSION_PANEL_GAP_PX + SESSION_CARD_WIDTH_PX;
const MARGIN = SESSION_PANEL_VIEWPORT_MARGIN * 2;

function mockLeftOffset(px: number) {
  (globalThis as { document?: unknown }).document = {
    documentElement: {},
  };
  (globalThis as { getComputedStyle?: unknown }).getComputedStyle = () => ({
    getPropertyValue: (name: string) =>
      name.includes("--topbar-left-offset") ? `${px}px` : "",
  });
}

afterEach(() => {
  delete (globalThis as { document?: unknown }).document;
  delete (globalThis as { getComputedStyle?: unknown }).getComputedStyle;
});

test("map panel fits when the calendar pane is wide enough", () => {
  mockLeftOffset(256);
  assert.equal(sessionMapPanelFitsBesideMenu(SESSION_CARD_WIDTH_PX, 1024), true);
  assert.equal(
    sessionMapPanelFitsBesideMenu(SESSION_CARD_WIDTH_PX, 256 + MARGIN + NEED),
    true,
  );
});

test("map panel does not fit beside the session menu at the 13-inch half-window size", () => {
  mockLeftOffset(256);
  assert.equal(sessionMapPanelFitsBesideMenu(SESSION_CARD_WIDTH_PX, 640), false);
  assert.equal(
    sessionMapPanelFitsBesideMenu(SESSION_CARD_WIDTH_PX, 256 + MARGIN + NEED - 1),
    false,
  );
});

test("an open map closes as soon as it would clip to the right of the session card", () => {
  mockLeftOffset(256);
  // Pane is wide enough for the cluster, but the session sits too far right.
  assert.equal(
    sessionMapPanelFitsBesideMenu(SESSION_CARD_WIDTH_PX, 1200, 1000),
    false,
  );
  assert.equal(
    sessionMapPanelFitsBesideMenu(SESSION_CARD_WIDTH_PX, 1200, 400),
    true,
  );
});

test("session panel position is clamped inside the calendar pane", () => {
  mockLeftOffset(256);
  const margin = SESSION_PANEL_VIEWPORT_MARGIN;
  const shifted = clampSessionPanelPosition({
    left: 900,
    top: 40,
    width: SESSION_CARD_WIDTH_PX,
    height: 400,
    viewportWidth: 800,
    viewportHeight: 700,
  });
  assert.equal(shifted.left, 800 - SESSION_CARD_WIDTH_PX - margin);
  assert.equal(shifted.top, 40);

  const underRail = clampSessionPanelPosition({
    left: 10,
    top: 40,
    width: SESSION_CARD_WIDTH_PX,
    height: 400,
    viewportWidth: 800,
    viewportHeight: 700,
  });
  assert.equal(underRail.left, 256 + margin);
});

test("widening the viewport places the session panel beside its tile again", () => {
  mockLeftOffset(256);
  const margin = SESSION_PANEL_VIEWPORT_MARGIN;
  const tile = {
    x: 300,
    y: 80,
    left: 300,
    right: 400,
    top: 80,
    bottom: 120,
    width: 100,
    height: 40,
    toJSON() {
      return this;
    },
  } as DOMRect;

  const prevWindow = (globalThis as { window?: Window }).window;
  (globalThis as { window?: { innerWidth: number; innerHeight: number } }).window = {
    innerWidth: 1400,
    innerHeight: 800,
  };

  try {
    const fromTile = computePopoverPosition(tile, SESSION_CARD_WIDTH_PX, 400);
    const placed = clampSessionPanelPosition({
      left: fromTile.left,
      top: fromTile.top,
      width: SESSION_CARD_WIDTH_PX,
      height: 400,
      viewportWidth: 1400,
      viewportHeight: 800,
    });
    // After a shrink, the panel sits on the right edge (e.g. vw 650).
    const staleEdge = 650 - SESSION_CARD_WIDTH_PX - margin;
    const stuck = clampSessionPanelPosition({
      left: staleEdge,
      top: 80,
      width: SESSION_CARD_WIDTH_PX,
      height: 400,
      viewportWidth: 1400,
      viewportHeight: 800,
    });

    assert.equal(placed.left, tile.right + margin);
    assert.equal(stuck.left, staleEdge);
    assert.notEqual(placed.left, stuck.left);
  } finally {
    if (prevWindow) (globalThis as { window?: Window }).window = prevWindow;
    else delete (globalThis as { window?: Window }).window;
  }
});
