/**
 * GroupMemberHoverMenu — macOS-style hover menu anchored to the
 * group-members icon in the top tab bar. Lists the leader's group
 * members; clicking an entry opens that member as a tab on the
 * /team/group-members page.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { useGroupMembers, memberDisplayName, type GroupMemberRow } from "@/hooks/useGroupMembers";

const CLOSE_DELAY_MS = 120;

export function GroupMemberHoverMenu({
  children,
}: {
  children: React.ReactNode;
}) {
  const { members, loading } = useGroupMembers();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const closeTimer = useRef<number | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const update = () => {
      const r = triggerRef.current!.getBoundingClientRect();
      setPos({ left: r.left, top: r.bottom + 6 });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  // Auto-focus the search field on open; restore previous focus on close.
  useEffect(() => {
    if (open) {
      const active = document.activeElement as HTMLElement | null;
      if (active && active !== inputRef.current) {
        prevFocusRef.current = active;
      }
      // wait for portal mount
      const id = window.requestAnimationFrame(() => {
        inputRef.current?.focus({ preventScroll: true });
      });
      return () => window.cancelAnimationFrame(id);
    } else {
      setQuery("");
      const prev = prevFocusRef.current;
      prevFocusRef.current = null;
      if (prev && document.body.contains(prev)) {
        try { prev.focus({ preventScroll: true }); } catch { /* noop */ }
      }
    }
  }, [open]);

  const cancelClose = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };
  useEffect(() => () => cancelClose(), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => memberDisplayName(m).toLowerCase().includes(q));
  }, [members, query]);

  const openMember = (m: GroupMemberRow) => {
    setOpen(false);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("group-member:open", {
          detail: {
            user_id: m.user_id,
            group_id: m.group_id,
            name: memberDisplayName(m),
            avatar_url: m.avatar_url,
          },
        }),
      );
    }
    void navigate({ to: "/clients" });
  };

  return (
    <div
      ref={triggerRef}
      className="relative"
      onMouseEnter={() => { cancelClose(); setOpen(true); }}
      onMouseLeave={scheduleClose}
    >
      {children}
      {open && pos && typeof document !== "undefined" && createPortal(
        <div
          role="menu"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          className="mac-menu fixed z-[100] w-64 overflow-hidden rounded-lg p-1"
          style={{ transition: "none", left: pos.left, top: pos.top }}
        >
          <div className="px-1 pb-1 pt-0.5">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setOpen(false);
                } else if (e.key === "Enter" && filtered.length > 0) {
                  e.preventDefault();
                  openMember(filtered[0]);
                }
              }}
              placeholder="Search client"
              spellCheck={false}
              autoComplete="off"
              className="w-full rounded-md border border-black/10 bg-white px-2 py-1 text-xs outline-none focus:border-black/20 focus:ring-0"
              style={{ color: "#1d1d1f", caretColor: "#1d1d1f" }}
            />
          </div>
          {loading && (
            <div className="px-2 py-1 text-[11px] text-muted-foreground">
              Loading…
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="px-2 py-1 text-[11px] text-muted-foreground">
              {members.length === 0 ? "No members yet." : "No matches."}
            </div>
          )}
          {filtered.map((m) => {
            const name = memberDisplayName(m);
            return (
              <button
                key={`${m.group_id}-${m.user_id}`}
                type="button"
                role="menuitem"
                onClick={() => openMember(m)}
                className="group flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs outline-none hover:bg-black/[0.06]"
                style={{ transition: "none", color: "#1d1d1f" }}
                title={name}
              >
                {m.avatar_url ? (
                  <img
                    src={m.avatar_url}
                    alt=""
                    className="h-5 w-5 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-secondary text-[9px] uppercase text-muted-foreground">
                    {name.slice(0, 1)}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate">{name}</span>
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
