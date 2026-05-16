import { useEffect, useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu";
import {
  ChevronLeft,
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
  /** Allow color edits. Defaults to true. */
  allowColor?: boolean;
};

// 9 standard colors (3x3 grid)
export const STANDARD_COLORS: ColorValue[] = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#64748b", // slate
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

// ---- component ----
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
  const [view, setView] = useState<"main" | "colors" | "custom">("main");

  useEffect(() => {
    if (!open) {
      // delay reset so the close animation doesn't flash a different view
      const t = window.setTimeout(() => setView("main"), 150);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  // Fixed height so all 3 views match. Tuned to fit the colors view (3x3 + header + custom row).
  const FIXED_HEIGHT = 248;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="right"
        sideOffset={4}
        collisionPadding={8}
        className="w-56 overflow-hidden p-0"
        style={{ height: FIXED_HEIGHT }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {view === "main" && (
          <MainView
            onRename={onRename}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            extraItems={extraItems}
            allowColor={allowColor}
            onOpenColors={() => setView("colors")}
            onClose={() => setOpen(false)}
          />
        )}
        {view === "colors" && (
          <ColorsView
            currentColor={currentColor}
            onPick={(hex) => {
              onColorChange(hex);
              setOpen(false);
            }}
            onBack={() => setView("main")}
            onCustom={() => setView("custom")}
          />
        )}
        {view === "custom" && (
          <CustomView
            initial={currentColor}
            onBack={() => setView("colors")}
            onSave={(hex) => {
              onColorChange(hex);
              setOpen(false);
            }}
            onPreview={(hex) => onColorChange(hex)}
          />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---- Main view ----
function MainView({
  onRename,
  onDuplicate,
  onDelete,
  extraItems,
  allowColor,
  onOpenColors,
  onClose,
}: {
  onRename?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  extraItems: CategoryExtraItem[];
  allowColor: boolean;
  onOpenColors: () => void;
  onClose: () => void;
}) {
  const topExtras = extraItems.filter((i) => i.top);
  const bottomExtras = extraItems.filter((i) => !i.top);

  return (
    <div className="flex h-full flex-col p-1 text-xs">
      {topExtras.map((it, i) => (
        <Item
          key={`t-${i}`}
          icon={it.icon}
          label={it.label}
          destructive={it.destructive}
          onClick={() => {
            it.onClick();
            onClose();
          }}
        />
      ))}
      {onRename && (
        <Item
          icon={<Pencil className="h-3.5 w-3.5" />}
          label="Rename"
          onClick={() => {
            onRename();
            onClose();
          }}
        />
      )}
      {onDuplicate && (
        <Item
          icon={<Copy className="h-3.5 w-3.5" />}
          label="Duplicate"
          onClick={() => {
            onDuplicate();
            onClose();
          }}
        />
      )}
      {allowColor && (
        <button
          type="button"
          onMouseEnter={onOpenColors}
          onClick={onOpenColors}
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-ink transition hover:bg-secondary"
        >
          <Palette className="h-3.5 w-3.5" />
          <span className="flex-1">Color</span>
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        </button>
      )}
      {bottomExtras.length > 0 && <div className="my-1 h-px bg-border" />}
      {bottomExtras.map((it, i) => (
        <Item
          key={`b-${i}`}
          icon={it.icon}
          label={it.label}
          destructive={it.destructive}
          onClick={() => {
            it.onClick();
            onClose();
          }}
        />
      ))}
      {onDelete && (
        <>
          {bottomExtras.length === 0 && <div className="my-1 h-px bg-border" />}
          <Item
            icon={<Trash2 className="h-3.5 w-3.5" />}
            label="Delete"
            destructive
            onClick={() => {
              onDelete();
              onClose();
            }}
          />
        </>
      )}
    </div>
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
      className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left transition ${
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

// ---- Colors view ----
function ColorsView({
  currentColor,
  onPick,
  onBack,
  onCustom,
}: {
  currentColor: ColorValue;
  onPick: (hex: ColorValue) => void;
  onBack: () => void;
  onCustom: () => void;
}) {
  return (
    <div className="flex h-full flex-col p-1 text-xs">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-ink transition hover:bg-secondary"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        <span>Color</span>
      </button>
      <div className="my-1 h-px bg-border" />
      <div className="grid flex-1 grid-cols-3 place-items-center gap-2 px-2 py-1">
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
      <div className="my-1 h-px bg-border" />
      <button
        type="button"
        onMouseEnter={onCustom}
        onClick={onCustom}
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-ink transition hover:bg-secondary"
      >
        <Palette className="h-3.5 w-3.5" />
        <span className="flex-1">Custom</span>
        <ChevronRight className="h-3 w-3 text-muted-foreground" />
      </button>
    </div>
  );
}

// ---- Custom view ----
function CustomView({
  initial,
  onBack,
  onSave,
  onPreview,
}: {
  initial: ColorValue;
  onBack: () => void;
  onSave: (hex: ColorValue) => void;
  onPreview?: (hex: ColorValue) => void;
}) {
  const [hue, setHue] = useState<number>(() => hex2hue(initial));
  const [preview, setPreview] = useState<ColorValue>(
    isValidHex(initial) ? initial : hsl2hex(hex2hue(initial)),
  );
  const [hexInput, setHexInput] = useState<string>(
    isValidHex(initial) ? initial : hsl2hex(hex2hue(initial)),
  );
  const hueRef = useRef<HTMLDivElement>(null);

  // sync hex input when hue dragged
  useEffect(() => {
    onPreview?.(preview);
  }, [preview, onPreview]);

  const applyHue = (h: number) => {
    setHue(h);
    const hex = hsl2hex(h);
    setPreview(hex);
    setHexInput(hex);
  };

  const onHexChange = (v: string) => {
    setHexInput(v);
    if (isValidHex(v)) {
      const h = hex2hue(v);
      setHue(h);
      setPreview(v);
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
    <div className="flex h-full flex-col p-1 text-xs">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-ink transition hover:bg-secondary"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        <span>Custom</span>
      </button>
      <div className="my-1 h-px bg-border" />
      <div className="flex flex-1 gap-2 p-2">
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
          className="relative w-3.5 cursor-pointer rounded border border-hairline touch-none"
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
    </div>
  );
}
