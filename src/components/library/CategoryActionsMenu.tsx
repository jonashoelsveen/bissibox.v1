import { useEffect, useId, useRef, useState } from "react";
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

// ---- Singleton coordinator: only one CategoryActionsMenu open at a time ----
let openMenuId: string | null = null;
const openMenuListeners = new Set<(id: string | null) => void>();
function setOpenMenuId(id: string | null) {
  if (openMenuId === id) return;
  openMenuId = id;
  openMenuListeners.forEach((l) => l(id));
}

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
  const [colorSubOpen, setColorSubOpen] = useState(false);
  const colorCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipCloseAutoFocusRef = useRef(false);
  const menuId = useId();
  const topExtras = extraItems.filter((i) => i.top);
  const bottomExtras = extraItems.filter((i) => !i.top);

  const close = () => setOpen(false);

  // Only one CategoryActionsMenu open at a time across the app.
  useEffect(() => {
    const cb = (id: string | null) => {
      if (id !== menuId && open) setOpen(false);
    };
    openMenuListeners.add(cb);
    return () => {
      openMenuListeners.delete(cb);
    };
  }, [menuId, open]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setOpenMenuId(menuId);
    } else {
      setColorSubOpen(false);
      if (openMenuId === menuId) setOpenMenuId(null);
    }
  };

  const cancelColorClose = () => {
    if (colorCloseTimerRef.current) {
      clearTimeout(colorCloseTimerRef.current);
      colorCloseTimerRef.current = null;
    }
  };
  const scheduleColorClose = () => {
    cancelColorClose();
    colorCloseTimerRef.current = setTimeout(() => setColorSubOpen(false), 40);
  };

  useEffect(() => () => cancelColorClose(), []);

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>

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
          <DropdownMenuSub open={colorSubOpen} onOpenChange={setColorSubOpen}>
            <DropdownMenuSubTrigger
              onClick={(e) => {
                // Hover-only: clicking the Color row must not toggle/close the sub.
                e.preventDefault();
              }}
              onPointerEnter={() => {
                cancelColorClose();
                setColorSubOpen(true);
              }}
              onPointerLeave={scheduleColorClose}
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
              onPointerEnter={cancelColorClose}
              onPointerLeave={scheduleColorClose}
            >
              <ColorsPanel
                currentColor={currentColor}
                swatches={colorSwatches}
                onPick={(hex) => {
                  // Persistent panel — keep open after click so user sees the
                  // check move and can pick again. Closes naturally on hover-out.
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
