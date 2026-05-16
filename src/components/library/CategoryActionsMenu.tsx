import { useEffect, useRef, useState } from "react";
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
};

// 9 standard colors (3x3 grid)
export const STANDARD_COLORS: ColorValue[] = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#64748b",
];

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
}: CategoryActionsMenuProps) {
  const [open, setOpen] = useState(false);
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
            <DropdownMenuSubTrigger className="gap-2 px-2 py-1.5 text-xs text-ink focus:bg-secondary focus:text-ink data-[state=open]:bg-secondary">
              <Palette className="h-3.5 w-3.5" />
              <span className="flex-1">Color</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent
              sideOffset={SUB_OFFSET}
              collisionPadding={8}
              className="p-2"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <ColorsPanel
                currentColor={currentColor}
                onPick={(hex) => {
                  onColorChange(hex);
                  close();
                }}
                customPanel={
                  <CustomPanel
                    initial={currentColor}
                    onPreview={(hex) => onColorChange(hex)}
                    onSave={(hex) => {
                      onColorChange(hex);
                      close();
                    }}
                  />
                }
              />
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
}: {
  currentColor: ColorValue;
  onPick: (hex: ColorValue) => void;
  customPanel: React.ReactNode;
}) {
  return (
    <div className="flex flex-col text-xs">
      <div className="grid grid-cols-3 place-items-center gap-2 px-1 py-1">
        {STANDARD_COLORS.map((hex) => {
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
      <DropdownMenuSeparator />
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="gap-2 px-2 py-1.5 text-xs text-ink focus:bg-secondary focus:text-ink data-[state=open]:bg-secondary">
          <Palette className="h-3.5 w-3.5" />
          <span className="flex-1">Custom</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent
          sideOffset={SUB_OFFSET}
          collisionPadding={8}
          className="p-2"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {customPanel}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </div>
  );
}

// ---- Custom picker panel ----
function CustomPanel({
  initial,
  onSave,
  onPreview,
}: {
  initial: ColorValue;
  onSave: (hex: ColorValue) => void;
  onPreview?: (hex: ColorValue) => void;
}) {
  const seed = isValidHex(initial) ? initial : hsl2hex(hex2hue(initial));
  const [hue, setHue] = useState<number>(() => hex2hue(seed));
  const [preview, setPreview] = useState<ColorValue>(seed);
  const [hexInput, setHexInput] = useState<string>(seed);
  const hueRef = useRef<HTMLDivElement>(null);

  const applyHue = (h: number) => {
    setHue(h);
    const hex = hsl2hex(h);
    setPreview(hex);
    setHexInput(hex);
    onPreview?.(hex);
  };

  const onHexChange = (v: string) => {
    setHexInput(v);
    if (isValidHex(v)) {
      setHue(hex2hue(v));
      setPreview(v);
      onPreview?.(v);
    }
  };

  const dragHue = (clientY: number) => {
    const el = hueRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientY - r.top) / r.height));
    applyHue(pct * 360);
  };

  const onHuePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const el = hueRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    dragHue(e.clientY);
    const onMove = (ev: PointerEvent) => dragHue(ev.clientY);
    const onUp = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
  };

  const huePct = (hue / 360) * 100;

  return (
    <div className="flex h-44 w-48 gap-2 text-xs">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <input
          type="text"
          value={hexInput}
          onChange={(e) => onHexChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && isValidHex(hexInput)) onSave(hexInput);
          }}
          spellCheck={false}
          placeholder="#000000"
          className="w-full rounded border border-hairline bg-background px-2 py-1 font-mono text-[11px] outline-none focus:border-ink/30"
        />
        <div className="flex flex-1 gap-2">
          <div
            className="flex-1 rounded border border-hairline"
            style={{ background: preview }}
            aria-label="Color preview"
          />
          <button
            type="button"
            onClick={() => onSave(preview)}
            className="flex w-7 items-center justify-center rounded bg-ink text-[10px] font-semibold tracking-wider text-background hover:opacity-90"
            style={{ writingMode: "vertical-rl" as const, textOrientation: "mixed" as const }}
          >
            SAVE
          </button>
        </div>
      </div>
      <div
        ref={hueRef}
        onPointerDown={onHuePointerDown}
        className="relative w-3.5 cursor-pointer touch-none rounded border border-hairline"
        style={{
          background:
            "linear-gradient(to bottom, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)",
        }}
      >
        <div
          className="pointer-events-none absolute -left-[2px] -right-[2px] h-1 -translate-y-1/2 border border-black bg-white"
          style={{ top: `${huePct}%` }}
        />
      </div>
    </div>
  );
}
