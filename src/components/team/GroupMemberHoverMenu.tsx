/**
 * GroupMemberHoverMenu — macOS-style hover menu anchored to the
 * group-members icon in the top tab bar. Lists the leader's group
 * members; clicking an entry opens that member as a tab on the
 * /team/group-members page.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  const navigate = useNavigate();
  const closeTimer = useRef<number | null>(null);

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
      className="relative"
      onMouseEnter={() => { cancelClose(); setOpen(true); }}
      onMouseLeave={scheduleClose}
    >
      {children}
      {open && (
        <div
          role="menu"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          className="mac-menu absolute left-0 top-full z-[100] mt-1.5 w-60 overflow-hidden rounded-lg p-1"
          style={{ transition: "none" }}
        >
          {loading && (
            <div className="px-2 py-1 text-[11px] text-muted-foreground">
              Loading…
            </div>
          )}
          {!loading && members.length === 0 && (
            <div className="px-2 py-1 text-[11px] text-muted-foreground">
              No members yet.
            </div>
          )}
          {members.map((m) => {
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
        </div>
      )}
    </div>
  );
}
