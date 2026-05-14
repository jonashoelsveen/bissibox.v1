# Plan — Albums UX overhaul + Media settings

Scope is large; here's the structured plan before I touch code.

## 1. Selection model in album/gallery view (`src/routes/media.tsx`)

- Replace single-click-opens behavior with:
  - **Single click** → toggles selection on the card (thin black border, ~1.5px, inset, rounded matching card). Apple iCloud-style.
  - **Cmd/Ctrl + click** → adds/removes from multi-selection.
  - **Shift + click** → range-select between last clicked and current.
  - **Double click** → opens the item (current behavior).
- Selection state lives in the gallery component as `Set<string>`.
- Clicking outside cards / pressing Esc clears selection.
- Border uses semantic token (`border-foreground/80`) so it adapts to light/dark album bg.

## 2. Frozen top media-bar in album view

- New sticky bar at top of the gallery scroll area (inside the album route, below global TopBar and right for left menu-panel).
- Same background color as album (theme-driven, see §5).
- Right-aligned icons: ♥ heart, 🗑 delete, ⋯ three-dot menu.
  - When no card selected → `text-muted-foreground/40`, `pointer-events-none`.
  - When ≥1 selected → fully colored, clickable.
  - Heart = toggle favorite (wire to existing if present, else stub action), Delete = existing delete flow on selection, ⋯ = existing per-item menu adapted to multi.

## 3. Opened-item view: same frozen bar + slide-out edit panel

- When an item opens, keep the same top media-bar visible at the same height.
- Left side: back arrow (← returns to album).
- Right side: single Edit icon (Apple-style pencil-in-square) replaces the 3 icons.
- The right side panel (About / Access / Draw / Export) is **hidden by default**.
- Clicking Edit slides the panel in from the right (`translate-x-full` → `translate-x-0`, `transition-transform duration-300 ease-out`). Clicking again closes it.
- Panel sits *below* the frozen top-bar so the Edit icon stays visible above it.
- Panel itself keeps current background (unaffected by album theme).

## 4. Media settings tab (`src/routes/settings.tsx`)

- New left-nav entry under "Library" → "Media".
- First section: **Album background**.
- Two visual tiles (light / dark), same component pattern as session-view modals (see `session-tile-design.ts` / existing settings tiles).
- Each tile shows a mini illustration: card grid + bar with the corresponding bg.
- Default = light. Persist via `useLibrarySetting<'light'|'dark'>('media:album-bg', 'light')`.

## 5. Album theme propagation

- Read setting in media route: `const [albumBg] = useLibrarySetting('media:album-bg', 'light')`.
- Apply to album page wrapper, frozen top-bar, and opened-item view as a single class:
  - `light` → `bg-background text-foreground`
  - `dark` → `bg-zinc-950 text-zinc-100`
- Top-bar icons use `currentColor` so they invert automatically.
- VideoPlayer gets an optional `theme?: 'light'|'dark'` prop; scrubber track + play/pause button derive colors from it (white on dark, black on light).
- Right edit panel keeps its existing background (not themed).

## Technical notes

- Selection logic: `useState<Set<string>>(new Set())`; helpers `toggle/range/clear`. `onClick` with `e.metaKey || e.ctrlKey`, `e.shiftKey`, plain. `onDoubleClick` → existing open handler. Use `onClickCapture` with a 250 ms double-click guard so single-click selection doesn't fire alongside open.
- Frozen bar: `sticky top-0 z-20` inside the gallery scroll container.
- Slide-out panel: existing right panel JSX wrapped in a `transform` div with `data-open` state.
- Settings tab: extend the same array/switch driving the Library section in `settings.tsx`.

## Out of scope

- No DB schema changes (favorites already exist or will be added later if missing — I'll wire heart to existing `favorited` field if present, otherwise no-op with toast "coming soon").
- No changes to the video bug fixes from previous turns.
- No changes to the side library nav, search, upload flow, or non-album views.

Ready to implement on approval.