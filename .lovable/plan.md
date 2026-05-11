# Apps launcher in the global top tab bar

Add a 3×3-dot "apps" icon immediately to the right of the existing Plus icon in `GlobalTopTabBar`. Because that bar renders on every page, the icon shows up everywhere automatically. Clicking it toggles a small modal appearing rught under it (icon's right side and the modal's right side is at the same vertical line), containing four black rounded "app" tiles plus an "Apps" label in the upper-left. Tiles are placeholders today, ready to be wired to external URLs later.

## What the user will see

- A new icon-button to the right of the Plus icon, same size (h-9 w-9), same hover background (`hover:bg-secondary`), same muted→ink color transition.
- The icon itself is a sharp inline SVG: a 3×3 grid of small filled dots (matches the reference image, similar to Apple/Google's launcher).
- Clicking it opens a panel:
  - Anchored under the icon, right edge aligned to the icon's right edge.
  - Header row with the word **Apps** in the upper-left (small, semibold, muted).
  - A 2×2 grid of four black rounded-square tiles (~64×64), generous padding, subtle shadow, hairline border, popover background.
  - Each tile is a placeholder `<a>` with `href="#"`, `target="_blank"`, `rel="noopener noreferrer"` so they're trivially swapped to real external URLs later.
- Open animation: fade + scale-in from top-right origin (`origin-top-right`, `animate-in fade-in zoom-in-95 slide-in-from-top-1 duration-150`) so it visibly emerges from the icon.
- Close animation: same in reverse via Tailwind `animate-out` utilities.
- Closes on outside click, Escape key, or clicking the icon again — same pattern already used by the Plus menu in this file.

## Where the change lives

Single file: `src/components/GlobalTopTabBar.tsx`.

- Add an `appsOpen` state and `appsRef` next to the existing `plusOpen` / `plusRef`.
- Reuse the existing outside-click + Escape `useEffect` pattern (either extend the current effect to handle both, or add a sibling effect — sibling effect is cleaner and keeps the diff small).
- Insert the new button + popover JSX between the Plus `<div>` and the closing container `</div>`. Visual order in the bar (left → right): … Search · Plus · **Apps**.
- Mutual exclusion: opening Apps closes Plus and vice-versa, so only one popover is visible at a time.

## Icon

Inline SVG component defined in the same file (no new dependency, sharp at any DPI):

```text
9 dots, 3×3, equal spacing, currentColor fill, sized 18×18 to match Plus/Search.
```

Roughly: `viewBox="0 0 24 24"`, nine `<circle r="1.6">` at x/y ∈ {5, 12, 19}.

## Modal contents

```text
┌──────────────────────────────┐
│ Apps                         │
│                              │
│  ┌────┐  ┌────┐              │
│  │    │  │    │              │
│  └────┘  └────┘              │
│  ┌────┐  ┌────┐              │
│  │    │  │    │              │
│  └────┘  └────┘              │
└──────────────────────────────┘
```

- Container: `w-56`, `rounded-xl border border-hairline bg-popover p-3 shadow-xl`.
- Header: `<div className="px-1 pb-2 text-xs font-semibold text-muted-foreground">Apps</div>`.
- Grid: `grid grid-cols-2 gap-2`.
- Tile: `<a>` with `aria-label="App {n}"`, classes `aspect-square rounded-xl bg-foreground transition hover:opacity-90` (uses the semantic `bg-foreground` token so it stays crisp black in light mode and inverts correctly in dark mode — matches the design-system rule of no raw color classes).

## Out of scope

- No real app destinations / icons inside tiles yet (placeholders only, per the user's choice).
- No changes to the Plus menu, Search, ProfileTab, or any page-level component.
- No new routes, no backend changes.

## Acceptance

- The Apps icon appears on every page, right of Plus, same hover behavior.
- Clicking it opens the panel anchored to its right edge, with "Apps" label and four black tiles in a 2×2 grid.
- Open/close animates smoothly from the icon.
- Outside-click, Escape, and toggling the icon all close the panel.
- Opening Apps closes the Plus menu (and vice-versa).