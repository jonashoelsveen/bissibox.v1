import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  layoutTimedOverlaps,
  overlapColumnAtX,
  timedEventsOverlap,
} from "../components/calendar/timedEventOverlapLayout.ts";

describe("timedEventsOverlap", () => {
  it("treats touching endpoints as non-overlapping", () => {
    assert.equal(
      timedEventsOverlap({ startMin: 60, endMin: 120 }, { startMin: 120, endMin: 180 }),
      false,
    );
  });

  it("detects a true overlap", () => {
    assert.equal(
      timedEventsOverlap({ startMin: 60, endMin: 150 }, { startMin: 120, endMin: 180 }),
      true,
    );
  });
});

describe("layoutTimedOverlaps", () => {
  it("gives a solo session full width", () => {
    const layout = layoutTimedOverlaps([
      { id: "a", startMin: 9 * 60, endMin: 10 * 60, sortIndex: 1 },
    ]);
    const a = layout.get("a");
    assert.ok(a);
    assert.equal(a.col, 0);
    assert.equal(a.colCount, 1);
    assert.equal(a.leftPct, 0);
    assert.equal(a.widthPct, 1);
  });

  it("does not split sessions that only touch", () => {
    const layout = layoutTimedOverlaps([
      { id: "a", startMin: 9 * 60, endMin: 10 * 60, sortIndex: 1 },
      { id: "b", startMin: 10 * 60, endMin: 11 * 60, sortIndex: 2 },
    ]);
    assert.equal(layout.get("a")?.widthPct, 1);
    assert.equal(layout.get("b")?.widthPct, 1);
    assert.equal(layout.get("a")?.colCount, 1);
    assert.equal(layout.get("b")?.colCount, 1);
  });

  it("places two concurrent sessions in equal columns", () => {
    const layout = layoutTimedOverlaps([
      { id: "a", startMin: 9 * 60, endMin: 10 * 60, sortIndex: 1 },
      { id: "b", startMin: 9 * 60, endMin: 10 * 60, sortIndex: 2 },
    ]);
    const a = layout.get("a");
    const b = layout.get("b");
    assert.ok(a && b);
    assert.equal(a.colCount, 2);
    assert.equal(b.colCount, 2);
    assert.equal(a.col, 0);
    assert.equal(b.col, 1);
    assert.equal(a.widthPct, 0.5);
    assert.equal(b.widthPct, 0.5);
  });

  it("puts the later-created session on the right even if it starts earlier", () => {
    const layout = layoutTimedOverlaps([
      { id: "old", startMin: 9 * 60, endMin: 11 * 60, sortIndex: 1 },
      { id: "new", startMin: 8 * 60, endMin: 10 * 60, sortIndex: 2 },
    ]);
    const older = layout.get("old");
    const newer = layout.get("new");
    assert.ok(older && newer);
    assert.equal(older.col, 0);
    assert.equal(newer.col, 1);
  });

  it("treats missing sortIndex as older than a timestamped session", () => {
    const layout = layoutTimedOverlaps([
      { id: "legacy", startMin: 9 * 60, endMin: 10 * 60 },
      { id: "new", startMin: 9 * 60, endMin: 10 * 60, sortIndex: Date.now() },
    ]);
    assert.equal(layout.get("legacy")?.col, 0);
    assert.equal(layout.get("new")?.col, 1);
  });

  it("reflows existing sessions when a live drop-preview overlaps them", () => {
    const layout = layoutTimedOverlaps([
      { id: "resident", startMin: 9 * 60, endMin: 10 * 60, sortIndex: 1 },
      {
        id: "__drag-snap__",
        startMin: 9 * 60,
        endMin: 10 * 60,
        sortIndex: Number.MAX_SAFE_INTEGER,
      },
    ]);
    assert.equal(layout.get("resident")?.col, 0);
    assert.equal(layout.get("resident")?.colCount, 2);
    assert.equal(layout.get("resident")?.widthPct, 0.5);
    assert.equal(layout.get("__drag-snap__")?.col, 1);
    assert.equal(layout.get("__drag-snap__")?.widthPct, 0.5);
  });

  it("puts a live create-preview on the right of existing overlapping sessions", () => {
    const layout = layoutTimedOverlaps([
      { id: "a", startMin: 9 * 60, endMin: 10 * 60, sortIndex: 1 },
      { id: "b", startMin: 9 * 60, endMin: 10 * 60, sortIndex: 2 },
      {
        id: "__mark-preview__",
        startMin: 9 * 60,
        endMin: 10 * 60,
        sortIndex: Number.MAX_SAFE_INTEGER,
        preferRight: true,
      },
    ]);
    assert.equal(layout.get("a")?.col, 0);
    assert.equal(layout.get("b")?.col, 1);
    assert.equal(layout.get("__mark-preview__")?.col, 2);
    assert.equal(layout.get("__mark-preview__")?.colCount, 3);
  });

  it("splits five concurrent sessions into five columns", () => {
    const events = Array.from({ length: 5 }, (_, i) => ({
      id: `e${i}`,
      startMin: 9 * 60,
      endMin: 9 * 60 + 5,
      sortIndex: i + 1,
    }));
    const layout = layoutTimedOverlaps(events);
    const cols = new Set<number>();
    for (let i = 0; i < 5; i++) {
      const p = layout.get(`e${i}`);
      assert.ok(p);
      assert.equal(p.colCount, 5);
      assert.equal(p.widthPct, 1 / 5);
      cols.add(p.col);
    }
    assert.equal(cols.size, 5);
  });

  it("keeps a long session in two columns when a short one overlaps it", () => {
    const layout = layoutTimedOverlaps([
      { id: "long", startMin: 9 * 60, endMin: 11 * 60, sortIndex: 1 },
      { id: "short", startMin: 9 * 60, endMin: 10 * 60, sortIndex: 2 },
    ]);
    const long = layout.get("long");
    const short = layout.get("short");
    assert.ok(long && short);
    assert.equal(long.colCount, 2);
    assert.equal(short.colCount, 2);
    assert.equal(long.widthPct, 0.5);
    assert.equal(short.widthPct, 0.5);
    assert.equal(long.col, 0);
    assert.equal(short.col, 1);
  });

  it("assigns twenty concurrent sessions equal positive widths that sum to 1", () => {
    const events = Array.from({ length: 20 }, (_, i) => ({
      id: `e${i}`,
      startMin: 9 * 60,
      endMin: 10 * 60,
      sortIndex: i + 1,
    }));
    const layout = layoutTimedOverlaps(events);
    const widths: number[] = [];
    const cols = new Set<number>();
    for (let i = 0; i < 20; i++) {
      const p = layout.get(`e${i}`);
      assert.ok(p);
      assert.equal(p.colCount, 20);
      assert.ok(p.widthPct > 0);
      widths.push(p.widthPct);
      cols.add(p.col);
    }
    assert.equal(cols.size, 20);
    const sum = widths.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9);
  });

  it("reuses a free column for a session that does not overlap the others", () => {
    const layout = layoutTimedOverlaps([
      { id: "a", startMin: 9 * 60, endMin: 10 * 60, sortIndex: 1 },
      { id: "b", startMin: 9 * 60 + 30, endMin: 10 * 60 + 30, sortIndex: 2 },
      { id: "c", startMin: 10 * 60, endMin: 11 * 60, sortIndex: 3 },
    ]);
    const a = layout.get("a");
    const b = layout.get("b");
    const c = layout.get("c");
    assert.ok(a && b && c);
    assert.equal(a.colCount, 2);
    assert.equal(b.colCount, 2);
    assert.equal(c.colCount, 2);
    assert.equal(a.col, 0);
    assert.equal(b.col, 1);
    assert.equal(c.col, 0);
  });

  it("reuses a free right column when a newcomer starts above a busy stretch", () => {
    const layout = layoutTimedOverlaps([
      { id: "long", startMin: 9 * 60, endMin: 12 * 60, sortIndex: 1 },
      { id: "short", startMin: 10 * 60, endMin: 10 * 60 + 30, sortIndex: 2 },
      {
        id: "__mark-preview__",
        startMin: 8 * 60,
        endMin: 9 * 60 + 30,
        sortIndex: Number.MAX_SAFE_INTEGER,
        preferRight: true,
      },
    ]);
    const long = layout.get("long");
    const short = layout.get("short");
    const preview = layout.get("__mark-preview__");
    assert.ok(long && short && preview);
    assert.equal(long.colCount, 2);
    assert.equal(short.col, 1);
    assert.equal(preview.col, 1);
    assert.equal(preview.colCount, 2);
  });

  it("fills a left-only hole when creating beside a session that already sits on the right", () => {
    const layout = layoutTimedOverlaps([
      { id: "a", startMin: 9 * 60, endMin: 10 * 60, sortIndex: 1 },
      { id: "b", startMin: 9 * 60 + 30, endMin: 10 * 60 + 30, sortIndex: 2 },
      {
        id: "__mark-preview__",
        startMin: 10 * 60,
        endMin: 11 * 60,
        sortIndex: Number.MAX_SAFE_INTEGER,
        preferRight: true,
      },
    ]);
    assert.equal(layout.get("a")?.col, 0);
    assert.equal(layout.get("b")?.col, 1);
    assert.equal(layout.get("__mark-preview__")?.col, 0);
    assert.equal(layout.get("__mark-preview__")?.colCount, 2);
  });

  it("fills a middle-only hole when left and right columns are already occupied", () => {
    const layout = layoutTimedOverlaps([
      { id: "left", startMin: 8 * 60, endMin: 12 * 60, sortIndex: 1 },
      { id: "mid", startMin: 10 * 60, endMin: 10 * 60 + 30, sortIndex: 2 },
      { id: "right", startMin: 8 * 60, endMin: 12 * 60, sortIndex: 3 },
      {
        id: "__mark-preview__",
        startMin: 9 * 60,
        endMin: 9 * 60 + 30,
        sortIndex: Number.MAX_SAFE_INTEGER,
        preferRight: true,
      },
    ]);
    assert.equal(layout.get("left")?.col, 0);
    assert.equal(layout.get("mid")?.col, 1);
    assert.equal(layout.get("right")?.col, 2);
    assert.equal(layout.get("__mark-preview__")?.col, 1);
    assert.equal(layout.get("__mark-preview__")?.colCount, 3);
  });

  it("puts a create-preview on the right when overlapping sessions sit in the middle with space on both sides", () => {
    const layout = layoutTimedOverlaps([
      { id: "left", startMin: 9 * 60, endMin: 10 * 60, sortIndex: 1 },
      { id: "mid", startMin: 9 * 60 + 15, endMin: 10 * 60 + 45, sortIndex: 2 },
      { id: "right", startMin: 9 * 60, endMin: 10 * 60, sortIndex: 3 },
      {
        id: "__mark-preview__",
        startMin: 10 * 60,
        endMin: 11 * 60,
        sortIndex: Number.MAX_SAFE_INTEGER,
        preferRight: true,
      },
    ]);
    assert.equal(layout.get("left")?.col, 0);
    assert.equal(layout.get("mid")?.col, 1);
    assert.equal(layout.get("right")?.col, 2);
    assert.equal(layout.get("__mark-preview__")?.col, 2);
    assert.equal(layout.get("__mark-preview__")?.colCount, 3);
  });

  it("maps cursor X onto overlap lanes", () => {
    assert.equal(overlapColumnAtX(1, 0.9), 0);
    assert.equal(overlapColumnAtX(2, 0.1), 0);
    assert.equal(overlapColumnAtX(2, 0.6), 1);
    assert.equal(overlapColumnAtX(3, 0.1), 0);
    assert.equal(overlapColumnAtX(3, 0.5), 1);
    assert.equal(overlapColumnAtX(3, 0.9), 2);
    assert.equal(overlapColumnAtX(3, 1), 2);
  });

  it("creates in the overlap lane under the cursor when both sides are free", () => {
    const residents = [
      { id: "left", startMin: 9 * 60, endMin: 10 * 60, sortIndex: 1 },
      { id: "mid", startMin: 9 * 60 + 15, endMin: 10 * 60 + 45, sortIndex: 2 },
      { id: "right", startMin: 9 * 60, endMin: 10 * 60, sortIndex: 3 },
    ];
    const mark = {
      id: "__mark-preview__",
      startMin: 10 * 60,
      endMin: 11 * 60,
      sortIndex: Number.MAX_SAFE_INTEGER,
    };
    const left = layoutTimedOverlaps([...residents, { ...mark, preferCol: 0 }]);
    assert.equal(left.get("__mark-preview__")?.col, 0);
    const right = layoutTimedOverlaps([...residents, { ...mark, preferCol: 2 }]);
    assert.equal(right.get("__mark-preview__")?.col, 2);
  });

  it("moves a blocked cursor lane to the rightmost free hole while dragging", () => {
    const layout = layoutTimedOverlaps([
      { id: "left", startMin: 9 * 60, endMin: 11 * 60, sortIndex: 1 },
      { id: "mid", startMin: 9 * 60 + 15, endMin: 10 * 60 + 45, sortIndex: 2 },
      { id: "right", startMin: 9 * 60, endMin: 10 * 60, sortIndex: 3 },
      {
        id: "__mark-preview__",
        startMin: 10 * 60,
        endMin: 11 * 60,
        sortIndex: Number.MAX_SAFE_INTEGER,
        preferCol: 0,
      },
    ]);
    assert.equal(layout.get("left")?.col, 0);
    assert.equal(layout.get("mid")?.col, 1);
    assert.equal(layout.get("right")?.col, 2);
    assert.equal(layout.get("__mark-preview__")?.col, 2);
  });

  it("fills every free overlap column so a create is not stuck at cursor-lane width", () => {
    const layout = layoutTimedOverlaps([
      { id: "left", startMin: 9 * 60, endMin: 11 * 60, sortIndex: 1 },
      { id: "mid", startMin: 9 * 60, endMin: 10 * 60, sortIndex: 2 },
      { id: "right", startMin: 9 * 60, endMin: 10 * 60, sortIndex: 3 },
      {
        id: "__mark-preview__",
        startMin: 10 * 60,
        endMin: 11 * 60,
        sortIndex: Number.MAX_SAFE_INTEGER,
        preferCol: 2,
      },
    ]);
    const preview = layout.get("__mark-preview__");
    assert.ok(preview);
    assert.equal(preview.colCount, 3);
    assert.equal(preview.col, 1);
    assert.equal(preview.span, 2);
    assert.equal(preview.widthPct, 2 / 3);
  });

  it("reuses a free column when dropping an existing session from above", () => {
    const layout = layoutTimedOverlaps([
      { id: "long", startMin: 9 * 60, endMin: 12 * 60, sortIndex: 1 },
      { id: "short", startMin: 10 * 60, endMin: 10 * 60 + 30, sortIndex: 2 },
      {
        id: "__drag-snap__",
        startMin: 8 * 60,
        endMin: 9 * 60 + 30,
        sortIndex: Number.MAX_SAFE_INTEGER,
      },
    ]);
    assert.equal(layout.get("__drag-snap__")?.col, 1);
    assert.equal(layout.get("__drag-snap__")?.colCount, 2);
    assert.equal(layout.get("long")?.colCount, 2);
  });

  it("still opens a new right column when every existing column is occupied", () => {
    const layout = layoutTimedOverlaps([
      { id: "a", startMin: 9 * 60, endMin: 11 * 60, sortIndex: 1 },
      { id: "b", startMin: 9 * 60, endMin: 11 * 60, sortIndex: 2 },
      {
        id: "__mark-preview__",
        startMin: 8 * 60,
        endMin: 10 * 60,
        sortIndex: Number.MAX_SAFE_INTEGER,
        preferRight: true,
      },
    ]);
    assert.equal(layout.get("__mark-preview__")?.col, 2);
    assert.equal(layout.get("__mark-preview__")?.colCount, 3);
  });

  it("packs a full-window session with timed sessions in the same column", () => {
    const windowStart = 8 * 60;
    const windowEnd = 20 * 60;
    const layout = layoutTimedOverlaps([
      { id: "all-day", startMin: windowStart, endMin: windowEnd, sortIndex: 1 },
      { id: "timed", startMin: 9 * 60, endMin: 10 * 60, sortIndex: 2 },
    ]);
    const allDay = layout.get("all-day");
    const timed = layout.get("timed");
    assert.ok(allDay && timed);
    assert.equal(allDay.colCount, 2);
    assert.equal(timed.colCount, 2);
    assert.equal(allDay.col, 0);
    assert.equal(timed.col, 1);
    assert.equal(allDay.widthPct, 0.5);
    assert.equal(timed.widthPct, 0.5);
  });

  it("puts a session on the right after its sortIndex is promoted", () => {
    const before = layoutTimedOverlaps([
      { id: "left", startMin: 9 * 60, endMin: 10 * 60, sortIndex: 1 },
      { id: "right", startMin: 9 * 60, endMin: 10 * 60, sortIndex: 2 },
    ]);
    assert.equal(before.get("left")?.col, 0);
    assert.equal(before.get("right")?.col, 1);

    const after = layoutTimedOverlaps([
      { id: "left", startMin: 9 * 60, endMin: 10 * 60, sortIndex: 3 },
      { id: "right", startMin: 9 * 60, endMin: 10 * 60, sortIndex: 2 },
    ]);
    assert.equal(after.get("left")?.col, 1);
    assert.equal(after.get("right")?.col, 0);
  });
});
