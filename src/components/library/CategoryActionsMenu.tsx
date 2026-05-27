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
  ChevronRight,
  Palette,
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

const isValidHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v.trim());

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

// ---- Colors panel (rendered in a separate sub popover) ----
function ColorsPanel({
  currentColor,
  onPick,
  customPanel,
  swatches = STANDARD_COLORS,
}: {
  currentColor: ColorValue;
  onPick: (hex: ColorValue) => void;
  customPanel: React.ReactNode;
  swatches?: ColorValue[];
}) {
  return (
    <div className="flex flex-col text-xs">
      <div className="grid grid-cols-4 place-items-center gap-2 px-1 py-1">
        {swatches.map((hex) => {
          const selected = currentColor.toLowerCase() === hex.toLowerCase();
          return (
            <button
              key={hex}
              type="button"
              onClick={() => onPick(hex)}
              aria-label={hex}
              className={`h-7 w-7 rounded-full border transition-transform hover:scale-110 ${
                selected ? "border-ink ring-2 ring-ink/30" : "border-black/10"
              }`}
              style={{ background: hex }}
            />
          );
        })}
      </div>
      {customPanel ? (
        <>
          {/* Negative margins extend the divider + Custom row to the full panel width, mirroring the Delete row in the main menu */}
          <DropdownMenuSeparator className="-mx-2 my-1" />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="-mx-2 box-border h-6 min-h-6 w-[calc(100%+1rem)] cursor-pointer rounded-sm px-2 py-0 text-xs text-ink transition hover:bg-secondary focus:bg-secondary focus:text-ink data-[state=open]:bg-secondary [&_svg]:shrink-0">
              <Palette className="h-3.5 w-3.5" />
              <span className="flex-1 text-left leading-none">Custom</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent
              sideOffset={4}
              collisionPadding={8}
              className="p-2"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {customPanel}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </>
      ) : null}
    </div>
  );
}


// ---- Custom picker panel ----
// HSV color: hue (0-360) selected via vertical strip, saturation+value via 2D canvas.
function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s;
  const hp = (h % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0,
    g = 0,
    b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = v - c;
  const to = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { h: 0, s: 1, v: 1 };
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

function CustomPanel({
  initial,
  onSave,
  onPreview,
}: {
  initial: ColorValue;
  onSave: (hex: ColorValue) => void;
  onPreview?: (hex: ColorValue) => void;
}) {
  const start = hexToHsv(isValidHex(initial) ? initial : "#3b82f6");
  const [h, setH] = useState(start.h);
  const [s, setS] = useState(start.s);
  const [v, setV] = useState(start.v);
  const [hexInput, setHexInput] = useState(isValidHex(initial) ? initial : hsvToHex(start.h, start.s, start.v));
  const canvasRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);

  const emit = (nh: number, ns: number, nv: number) => {
    const hex = hsvToHex(nh, ns, nv);
    setHexInput(hex);
    onPreview?.(hex);
  };

  const onCanvasDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    const el = canvasRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    const move = (cx: number, cy: number) => {
      const r = el.getBoundingClientRect();
      const ns = Math.max(0, Math.min(1, (cx - r.left) / r.width));
      const nv = 1 - Math.max(0, Math.min(1, (cy - r.top) / r.height));
      setS(ns);
      setV(nv);
      emit(h, ns, nv);
    };
    move(e.clientX, e.clientY);
    const onMove = (ev: PointerEvent) => move(ev.clientX, ev.clientY);
    const onUp = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
  };

  const onHueDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    const el = hueRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    const move = (cy: number) => {
      const r = el.getBoundingClientRect();
      const nh = Math.max(0, Math.min(1, (cy - r.top) / r.height)) * 360;
      setH(nh);
      emit(nh, s, v);
    };
    move(e.clientY);
    const onMove = (ev: PointerEvent) => move(ev.clientY);
    const onUp = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
  };

  const onHexChange = (val: string) => {
    setHexInput(val);
    if (isValidHex(val)) {
      const p = hexToHsv(val);
      setH(p.h);
      setS(p.s);
      setV(p.v);
      onPreview?.(val);
    }
  };

  const currentHex = hsvToHex(h, s, v);
  const hueColor = hsvToHex(h, 1, 1);

  return (
    <div className="flex flex-col gap-2 text-xs" style={{ width: 152 }}>
      {/* TOP: saturation/value canvas + vertical hue strip */}
      <div className="flex gap-2">
        <div
          ref={canvasRef}
          onPointerDown={onCanvasDrag}
          className="relative h-28 w-28 cursor-crosshair touch-none rounded border border-hairline"
          style={{
            background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})`,
          }}
        >
          <div
            className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
            style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%`, boxShadow: "0 0 0 1px rgba(0,0,0,0.5)" }}
          />
        </div>
        <div
          ref={hueRef}
          onPointerDown={onHueDrag}
          className="relative h-28 w-3 cursor-pointer touch-none rounded border border-hairline"
          style={{ background: "linear-gradient(to bottom, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)" }}
        >
          <div
            className="pointer-events-none absolute -left-[2px] -right-[2px] h-1 -translate-y-1/2 border border-black bg-white"
            style={{ top: `${(h / 360) * 100}%` }}
          />
        </div>
      </div>
      {/* BOTTOM: hex input + preview swatch + save */}
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={hexInput}
          onChange={(e) => onHexChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && isValidHex(hexInput)) onSave(hexInput);
          }}
          spellCheck={false}
          placeholder="#000000"
          className="min-w-0 flex-1 rounded border border-hairline bg-background px-1.5 py-1 font-mono text-[10px] outline-none focus:border-ink/30"
        />
        <div
          className="h-6 w-6 shrink-0 rounded border border-hairline"
          style={{ background: currentHex }}
          aria-label="Color preview"
        />
        <button
          type="button"
          onClick={() => onSave(currentHex)}
          className="shrink-0 rounded bg-ink px-2 py-1 text-[10px] font-semibold tracking-wide text-background hover:opacity-90"
        >
          Save
        </button>
      </div>
    </div>
  );
}
