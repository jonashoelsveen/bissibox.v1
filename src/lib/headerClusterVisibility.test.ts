import assert from "node:assert/strict";
import { test } from "node:test";
import { nextHeaderClusterHiding } from "../components/calendar/headerClusterVisibility.ts";

const CLOCK = 32;
const TODAY = 58;
const VIEW = 108;
const GAP = 6;

test("week/day hides Today first, then the view-type tab, keeping the clock", () => {
  const all = CLOCK + GAP + TODAY + GAP + VIEW;
  const clockAndView = CLOCK + GAP + VIEW;

  const wide = nextHeaderClusterHiding({
    available: all + 20,
    clockWidth: CLOCK,
    todayWidth: TODAY,
    viewTypeWidth: VIEW,
    hideToday: false,
    hideViewType: false,
  });
  assert.deepEqual(wide, { hideToday: false, hideViewType: false });

  const dropToday = nextHeaderClusterHiding({
    available: clockAndView + 4,
    clockWidth: CLOCK,
    todayWidth: TODAY,
    viewTypeWidth: VIEW,
    hideToday: false,
    hideViewType: false,
  });
  assert.deepEqual(dropToday, { hideToday: true, hideViewType: false });

  const dropView = nextHeaderClusterHiding({
    available: CLOCK + 4,
    clockWidth: CLOCK,
    todayWidth: TODAY,
    viewTypeWidth: VIEW,
    hideToday: true,
    hideViewType: false,
  });
  assert.deepEqual(dropView, { hideToday: true, hideViewType: true });
});

test("week/day shows the view-type tab again before Today when widening", () => {
  const clockAndView = CLOCK + GAP + VIEW;
  const all = CLOCK + GAP + TODAY + GAP + VIEW;

  const stillTight = nextHeaderClusterHiding({
    available: clockAndView + 2,
    clockWidth: CLOCK,
    todayWidth: TODAY,
    viewTypeWidth: VIEW,
    hideToday: true,
    hideViewType: true,
  });
  assert.equal(stillTight.hideViewType, true);
  assert.equal(stillTight.hideToday, true);

  const showView = nextHeaderClusterHiding({
    available: clockAndView + 12,
    clockWidth: CLOCK,
    todayWidth: TODAY,
    viewTypeWidth: VIEW,
    hideToday: true,
    hideViewType: true,
  });
  assert.deepEqual(showView, { hideToday: true, hideViewType: false });

  const showToday = nextHeaderClusterHiding({
    available: all + 12,
    clockWidth: CLOCK,
    todayWidth: TODAY,
    viewTypeWidth: VIEW,
    hideToday: true,
    hideViewType: false,
  });
  assert.deepEqual(showToday, { hideToday: false, hideViewType: false });
});

test("events stays while Today yields on week and month", () => {
  const events = 32;
  const sticky = events + GAP + CLOCK;
  const weekAll = sticky + GAP + TODAY + GAP + VIEW;
  const weekWithoutToday = sticky + GAP + VIEW;

  const dropToday = nextHeaderClusterHiding({
    available: weekWithoutToday + 4,
    eventsWidth: events,
    clockWidth: CLOCK,
    todayWidth: TODAY,
    viewTypeWidth: VIEW,
    hideToday: false,
    hideViewType: false,
  });
  assert.deepEqual(dropToday, { hideToday: true, hideViewType: false });

  const keepAll = nextHeaderClusterHiding({
    available: weekAll + 20,
    eventsWidth: events,
    clockWidth: CLOCK,
    todayWidth: TODAY,
    viewTypeWidth: VIEW,
    hideToday: false,
    hideViewType: false,
  });
  assert.deepEqual(keepAll, { hideToday: false, hideViewType: false });

  const monthNeeded = events + GAP + TODAY + GAP + VIEW;
  const monthTight = nextHeaderClusterHiding({
    available: events + GAP + VIEW + 4,
    eventsWidth: events,
    clockWidth: 0,
    todayWidth: TODAY,
    viewTypeWidth: VIEW,
    hideToday: false,
    hideViewType: false,
  });
  assert.deepEqual(monthTight, { hideToday: true, hideViewType: false });

  const monthWide = nextHeaderClusterHiding({
    available: monthNeeded + 20,
    eventsWidth: events,
    clockWidth: 0,
    todayWidth: TODAY,
    viewTypeWidth: VIEW,
    hideToday: true,
    hideViewType: false,
  });
  assert.deepEqual(monthWide, { hideToday: false, hideViewType: false });
});

test("month never hides the view-type tab", () => {
  const needed = TODAY + GAP + VIEW;
  const hiddenToday = nextHeaderClusterHiding({
    available: VIEW + 4,
    clockWidth: 0,
    todayWidth: TODAY,
    viewTypeWidth: VIEW,
    hideToday: false,
    hideViewType: false,
  });
  assert.deepEqual(hiddenToday, { hideToday: true, hideViewType: false });

  const shown = nextHeaderClusterHiding({
    available: needed + 20,
    clockWidth: 0,
    todayWidth: TODAY,
    viewTypeWidth: VIEW,
    hideToday: true,
    hideViewType: false,
  });
  assert.deepEqual(shown, { hideToday: false, hideViewType: false });
});
