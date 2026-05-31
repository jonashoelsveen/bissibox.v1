import { useEffect, useId, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Pencil, Copy, Trash2, Users, Check, ChevronRight } from "lucide-react";

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
  allowCustomColor?: boolean;
  colorSwatches?: ColorValue[];
  accessPanel?: React.ReactNode;
};

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
export const STANDARD_COLORS_8: ColorValue[] = STANDARD_COLORS.slice(0, 8);

const SUB_GAP = 4;

type SubPanel = "color" | "access" | null;

export function CategoryActionsMenu({
  trigger,
  onRename,
  onDuplicate,
  onDelete,
  currentColor,
  onColorChange,
  extraItems = [],
  allowColor = true,
  colorSwatches,
  accessPanel,
}: CategoryActionsMenuProps) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [subPanel, setSubPanel] = useState<SubPanel>(null);

  const triggerRef = useRef<HTMLDivElement>(null);
  const mainPanelRef = useRef<HTMLDivElement>(null);
  const subPanelRef = useRef<HTMLDivElement>(null);
  const colorRowRef = useRef<HTMLDivElement>(null);
  const accessRowRef = useRef<HTMLDivElement>(null);
  const subCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const topExtras = extraItems.filter((i) => i.top);
  const bottomExtras = extraItems.filter((i) => !i.top);

  const close = useCallback(() => {
    setOpen(false);
    setSubPanel(null);
    if (openMenuId === menuId) setOpenMenuId(null);
  }, [menuId]);

  useEffect(() => {
    const cb = (id: string | null) => {
      if (id !== menuId) setOpen(false);
    };
    openMenuListeners.add(cb);
    return () => { openMenuListeners.delete(cb); };
  }, [menuId]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        mainPanelRef.current?.contains(target) ||
        subPanelRef.current?.contains(target)
      ) return;
      close();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open, close]);

  useEffect(() => () => {
    if (subCloseTimerRef.current) clearTimeout(subCloseTimerRef.current);
  }, []);

  const openSub = (panel: SubPanel) => {
    if (subCloseTimerRef.current) {
      clearTimeout(subCloseTimerRef.current);
      subCloseTimerRef.current = null;
    }
    setSubPanel(panel);
  };

  const scheduledCloseSub = () => {
    if (subCloseTimerRef.current) clearTimeout(subCloseTimerRef.current);
    subCloseTimerRef.current = setTimeout(() => {
      setSubPanel(null);
      subCloseTimerRef.current = null;
    }, 180);
  };

  const cancelCloseSub = () => {
    if (subCloseTimerRef.current) {
      clearTimeout(subCloseTimerRef.current);
      subCloseTimerRef.current = null;
    }
  };

  const [mainPos, setMainPos] = useState<{ top: number; left: number } | null>(null);
  const [subPos, setSubPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open || !triggerRef.current) { setMainPos(null); return; }
    const rect = triggerRef.current.getBoundingClientRect();
    setMainPos({ top: rect.top, left: rect.right + 4 });
  }, [open]);

  useEffect(() => {
    if (!subPanel || !mainPanelRef.current) { setSubPos(null); return; }
    const rowRef = subPanel === "color" ? colorRowRef : accessRowRef;
    if (!rowRef.current) { setSubPos(null); return; }
    const rowRect = rowRef.current.getBoundingClientRect();
    const mainRect = mainPanelRef.current.getBoundingClientRect();
    setSubPos({ top: rowRect.top, left: mainRect.right + SUB_GAP });
  }, [subPanel]);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (open) {
      close();
    } else {
      setOpen(true);
      setOpenMenuId(menuId);
    }
  };

  return (
    <>
      <div ref={triggerRef} onClick={handleToggle} style={{ display: "contents" }}>
        {trigger}
      </div>

      {open && mainPos && createPortal(
        <div
          ref={mainPanelRef}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: mainPos.top,
            left: mainPos.left,
            zIndex: 9999,
            minWidth: 176,
          }}
          className="mac-menu rounded-lg p-1 shadow-md"
        >
          {topExtras.map((it, i) => (
            <MenuItem
              key={`t-${i}`}
              icon={it.icon}
              label={it.label}
              destructive={it.destructive}
              onClick={() => { it.onClick(); close(); }}
            />
          ))}

          {onRename && (
            <MenuItem
              icon={<Pencil className="h-3.5 w-3.5" />}
              label="Rename"
              onClick={() => { onRename(); close(); }}
            />
          )}

          {onDuplicate && (
            <MenuItem
              icon={<Copy className="h-3.5 w-3.5" />}
              label="Duplicate"
              onClick={() => { onDuplicate(); close(); }}
            />
          )}

          {allowColor && (
            <div
              ref={colorRowRef}
              onPointerEnter={() => openSub("color")}
              onPointerLeave={scheduledCloseSub}
              className={`flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-ink transition hover:bg-secondary ${subPanel === "color" ? "bg-secondary" : ""}`}
            >
              <span
                aria-hidden
                className="inline-block h-3.5 w-3.5 shrink-0 rounded-[3px] border border-black/15"
                style={{ background: currentColor || "transparent" }}
              />
              <span className="flex-1">Color</span>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            </div>
          )}

          {accessPanel && (
            <div
              ref={accessRowRef}
              onPointerEnter={() => openSub("access")}
              onPointerLeave={scheduledCloseSub}
              className={`flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-ink transition hover:bg-secondary ${subPanel === "access" ? "bg-secondary" : ""}`}
            >
              <Users className="h-3.5 w-3.5" />
              <span className="flex-1">Access</span>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            </div>
          )}

          {(bottomExtras.length > 0 || onDelete) && (
            <div className="my-1 h-px bg-hairline" />
          )}

          {bottomExtras.map((it, i) => (
            <MenuItem
              key={`b-${i}`}
              icon={it.icon}
              label={it.label}
              destructive={it.destructive}
              onClick={() => { it.onClick(); close(); }}
            />
          ))}

          {onDelete && (
            <MenuItem
              icon={<Trash2 className="h-3.5 w-3.5" />}
              label="Delete"
              destructive
              onClick={() => { onDelete(); close(); }}
            />
          )}
        </div>,
        document.body
      )}

      {open && subPanel && subPos && createPortal(
        <div
          ref={subPanelRef}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerEnter={cancelCloseSub}
          onPointerLeave={scheduledCloseSub}
          style={{
            position: "fixed",
            top: subPos.top,
            left: subPos.left,
            zIndex: 10000,
          }}
          className="mac-menu rounded-lg p-1 shadow-md"
        >
          {subPanel === "color" && (
            <ColorsPanel
              currentColor={currentColor}
              swatches={colorSwatches}
              onPick={(hex) => {
                onColorChange(hex);
              }}
            />
          )}
          {subPanel === "access" && accessPanel}
        </div>,
        document.body
      )}
    </>
  );
}

function MenuItem({
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
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
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

function ColorsPanel({
  currentColor,
  onPick,
  swatches,
}: {
  currentColor: ColorValue;
  onPick: (hex: ColorValue) => void;
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
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPick(hex); }}
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
