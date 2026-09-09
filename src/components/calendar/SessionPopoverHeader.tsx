import { useEffect, useRef, useState } from "react";
import { Copy, CopyPlus, MoreVertical, Trash2, X } from "lucide-react";
import { MenuShortcut } from "@/components/ui/MenuShortcut";
import {
  SHORTCUTS,
  matchesShortcut,
  shortcutAriaKeyshortcuts,
} from "@/lib/shortcuts";
import {
  SESSION_SIDE_MENU_GAP_PX,
  SESSION_SIDE_MENU_SHELL_CLASS,
  SESSION_SIDE_MENU_SHELL_STYLE,
} from "./sessionPanelDockUtils";
import {
  SESSION_ACTION_ITEM_CLASS,
  SESSION_DELETE_SHORTCUT_CLASS,
  sessionDeleteActionClass,
} from "./CalendarSessionContextMenu";

export function SessionPopoverHeader({
  isEdit,
  onClose,
  onCopySession,
  onDuplicateSession,
  onDeleteSession,
}: {
  isEdit: boolean;
  onClose: () => void;
  onCopySession?: () => void;
  onDuplicateSession?: () => void;
  onDeleteSession?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const showActions = isEdit && (onCopySession || onDuplicateSession || onDeleteSession);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        return;
      }
      if (
        matchesShortcut(e, SHORTCUTS.copySession) ||
        matchesShortcut(e, SHORTCUTS.duplicateSession) ||
        matchesShortcut(e, SHORTCUTS.deleteSession)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [menuOpen]);

  return (
    <>
      {showActions ? (
        <div ref={wrapRef} className="relative">
          <button
            type="button"
            aria-label="Session actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
          >
            <MoreVertical className="h-4 w-4" strokeWidth={2.25} />
          </button>
          {menuOpen ? (
            <div
              role="menu"
              className={`absolute right-full top-0 z-10 min-w-[220px] overflow-hidden p-1 ${SESSION_SIDE_MENU_SHELL_CLASS}`}
              style={{ ...SESSION_SIDE_MENU_SHELL_STYLE, marginRight: SESSION_SIDE_MENU_GAP_PX }}
            >
              {onCopySession ? (
                <button
                  type="button"
                  role="menuitem"
                  aria-keyshortcuts={shortcutAriaKeyshortcuts(SHORTCUTS.copySession)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    onCopySession();
                  }}
                  className={`${SESSION_ACTION_ITEM_CLASS} text-white/90 hover:bg-white/[0.08] hover:text-white`}
                >
                  <span className="flex items-center gap-2">
                    <Copy className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                    <span>Copy session</span>
                  </span>
                  <MenuShortcut shortcut={SHORTCUTS.copySession} className="text-white/45 group-hover:text-white" />
                </button>
              ) : null}
              {onDuplicateSession ? (
                <button
                  type="button"
                  role="menuitem"
                  aria-keyshortcuts={shortcutAriaKeyshortcuts(SHORTCUTS.duplicateSession)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    onDuplicateSession();
                  }}
                  className={`${SESSION_ACTION_ITEM_CLASS} text-white/90 hover:bg-white/[0.08] hover:text-white`}
                >
                  <span className="flex items-center gap-2">
                    <CopyPlus className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                    <span>Duplicate session</span>
                  </span>
                  <MenuShortcut
                    shortcut={SHORTCUTS.duplicateSession}
                    className="text-white/45 group-hover:text-white"
                  />
                </button>
              ) : null}
              {onDeleteSession ? (
                <button
                  type="button"
                  role="menuitem"
                  aria-keyshortcuts={shortcutAriaKeyshortcuts(SHORTCUTS.deleteSession)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    onDeleteSession();
                  }}
                  className={sessionDeleteActionClass(true)}
                >
                  <span className="flex items-center gap-2">
                    <Trash2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                    <span>Delete session</span>
                  </span>
                  <MenuShortcut
                    shortcut={SHORTCUTS.deleteSession}
                    className={SESSION_DELETE_SHORTCUT_CLASS}
                  />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        aria-label="Close"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
      >
        <X className="h-4 w-4" strokeWidth={2.25} />
      </button>
    </>
  );
}
