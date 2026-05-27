import { useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Pencil,
  Copy,
  Trash2,
  Users,
  Check,
} from "lucide-react";

export type ColorValue = string;

export type CategoryExtraItem = {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
  /** When true, item is shown at the top above Rename/Duplicate */
  top?: boolean;
};

export type CategoryActionsMenuProps = {
  trigger: React.ReactNode;
  onRename?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  currentColor: ColorValue;
  onColorChange: (color: ColorValue) => void;
  extraItems?: CategoryExtraItem[];
  allowColor?: boolean;
  /** When false the Custom (hue/sat) panel is hidden — only the swatches show. */
  allowCustomColor?: boolean;
  /** Optional override for the swatch palette (defaults to STANDARD_COLORS). */
  colorSwatches?: ColorValue[];
  /** Optional render slot for an "Access" submenu (shown under Color). */
  accessPanel?: React.ReactNode;
};

/**
 * 9 named standard colors — Tailwind 500/600 family for a consistent RGB
 * system. Red on top, brown at the bottom (replaces the old neutral gray).
 */
export const STANDARD_COLORS_NAMED: { hex: ColorValue; name: string }[] = [
  { hex: "#ef4444", name: "Red" },
  { hex: "#f97316", name: "Orange" },
  { hex: "#eab308", name: "Yellow" },
  { hex: "#22c55e", name: "Green" },
  { hex: "#06b6d4", name: "Cyan" },
  { hex: "#3b82f6", name: "Blue" },
  { hex: "#8b5cf6", name: "Purple" },
  { hex: "#ec4899", name: "Pink" },
  { hex: "#a16207", name: "Brown" },
];

export const STANDARD_COLORS: ColorValue[] = STANDARD_COLORS_NAMED.map((c) => c.hex);

/** 8-swatch palette (no brown) used by diary activity tabs. */
export const STANDARD_COLORS_8: ColorValue[] = STANDARD_COLORS.slice(0, 8);


// ---- color math ----
function hsl2hex(h: number, s = 1, l = 0.5): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function hex2hue(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = Math.round(h * 60);
  if (h < 0) h += 360;
  return h;
}



// Gap between adjacent popovers — matches the diary owner/leader note spacing (gap-2 = 8px)
const SUB_OFFSET = 8;

export function CategoryActionsMenu({
  trigger,
  onRename,
  onDuplicate,
  onDelete,
  currentColor,
  onColorChange,
  extraItems = [],
  allowColor = true,
  allowCustomColor = true,
  colorSwatches,
  accessPanel,
}: CategoryActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const skipCloseAutoFocusRef = useRef(false);
  const topExtras = extraItems.filter((i) => i.top);
  const bottomExtras = extraItems.filter((i) => !i.top);

  const close = () => setOpen(false);


  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="right"
        sideOffset={4}
        collisionPadding={8}
        className="w-44 p-1"
        onPointerDown={(e) => e.stopPropagation()}
        onCloseAutoFocus={(e) => {
          if (!skipCloseAutoFocusRef.current) return;
          e.preventDefault();
          skipCloseAutoFocusRef.current = false;
        }}
      >
        {topExtras.map((it, i) => (
          <Item
            key={`t-${i}`}
            icon={it.icon}
            label={it.label}
            destructive={it.destructive}
            onClick={() => {
              it.onClick();
              close();
            }}
          />
        ))}
        {onRename && (
          <Item
            icon={<Pencil className="h-3.5 w-3.5" />}
            label="Rename"
            onClick={() => {
              skipCloseAutoFocusRef.current = true;
              onRename();
              close();
            }}
          />
        )}
        {onDuplicate && (
          <Item
            icon={<Copy className="h-3.5 w-3.5" />}
            label="Duplicate"
            onClick={() => {
              onDuplicate();
              close();
            }}
          />
        )}
        {allowColor && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger
              onClick={(e) => {
                // Hover-only: clicking the Color row must not toggle/close the sub.
                e.preventDefault();
              }}
              className="gap-2 px-2 py-1.5 text-xs text-ink focus:bg-secondary focus:text-ink data-[state=open]:bg-secondary"
            >
              <span
                aria-hidden
                className="inline-block h-3.5 w-3.5 shrink-0 rounded-[3px] border border-black/15"
                style={{ background: currentColor || "transparent" }}
              />
              <span className="flex-1">Color</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent
              sideOffset={SUB_OFFSET}
              collisionPadding={8}
              className="p-1"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <ColorsPanel
                currentColor={currentColor}
                swatches={colorSwatches}
                onPick={(hex) => {
                  // Persistent panel — keep menu open so the user sees the
                  // check move and can pick again.
                  onColorChange(hex);
                }}
              />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        {accessPanel && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2 px-2 py-1.5 text-xs text-ink focus:bg-secondary focus:text-ink data-[state=open]:bg-secondary">
              <Users className="h-3.5 w-3.5" />
              <span className="flex-1">Access</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent
              sideOffset={SUB_OFFSET}
              collisionPadding={8}
              className="p-2"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {accessPanel}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        {(bottomExtras.length > 0 || onDelete) && <DropdownMenuSeparator />}
        {bottomExtras.map((it, i) => (
          <Item
            key={`b-${i}`}
            icon={it.icon}
            label={it.label}
            destructive={it.destructive}
            onClick={() => {
              it.onClick();
              close();
            }}
          />
        ))}
        {onDelete && (
          <Item
            icon={<Trash2 className="h-3.5 w-3.5" />}
            label="Delete"
            destructive
            onClick={() => {
              onDelete();
              close();
            }}
          />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Item({
  icon,
  label,
  onClick,
  destructive,
}: {
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs transition ${
        destructive
          ? "text-destructive hover:bg-destructive/10"
          : "text-ink hover:bg-secondary"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

// ---- Colors panel (Notion-style vertical list with 9 named colors) ----
function ColorsPanel({
  currentColor,
  onPick,
  swatches,
}: {
  currentColor: ColorValue;
  onPick: (hex: ColorValue) => void;
  /** Optional override — when provided, names are auto-derived from STANDARD_COLORS_NAMED if hexes match. */
  swatches?: ColorValue[];
}) {
  const rows: { hex: ColorValue; name: string }[] = swatches
    ? swatches.map((hex) => {
        const named = STANDARD_COLORS_NAMED.find(
          (c) => c.hex.toLowerCase() === hex.toLowerCase(),
        );
        return { hex, name: named?.name ?? hex.toUpperCase() };
      })
    : STANDARD_COLORS_NAMED;

  return (
    <div className="flex flex-col text-xs" style={{ minWidth: 168 }}>
      {rows.map(({ hex, name }) => {
        const selected = currentColor.toLowerCase() === hex.toLowerCase();
        return (
          <button
            key={hex}
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onPick(hex);
            }}
            className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-ink transition hover:bg-secondary"
          >
            <span
              aria-hidden
              className="inline-block h-3.5 w-3.5 shrink-0 rounded-[3px] border border-black/15"
              style={{ background: hex }}
            />
            <span className="min-w-0 flex-1 truncate">{name}</span>
            {selected && <Check className="h-3.5 w-3.5 shrink-0 text-ink" />}
          </button>
        );
      })}
    </div>
  );
}
