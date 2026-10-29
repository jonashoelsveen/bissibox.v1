/**
 * Entity left-panel search — same chrome as calendar session search.
 *
 *  - <EntitySearchToggle/> / <EntitySearchInput/> portal beside the panel icon.
 *  - <EntitySearchResults/> replace the side nav while search is active.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal, Pencil, Search, X } from "lucide-react";
import {
  DEFAULT_GROUP_COLOR,
  type EntityAdministrator,
  type EntityGroup,
  type EntityMember,
} from "@/hooks/useEntityRoster";
import { CategoryActionsMenu } from "@/components/library/CategoryActionsMenu";
import { GroupMembersIcon } from "@/components/entity/GroupMembersIcon";
import { cn } from "@/lib/utils";

const SEARCH_BTN_LEFT = 44;
const SEARCH_INPUT_WIDTH = 206;

interface EntitySearchValue {
  active: boolean;
  setActive: (next: boolean) => void;
  query: string;
  setQuery: (next: string) => void;
}

const Ctx = createContext<EntitySearchValue | null>(null);

export function EntitySearchProvider({ children }: { children: ReactNode }) {
  const [active, setActiveState] = useState(false);
  const [query, setQueryState] = useState("");

  const setActive = useCallback((next: boolean) => {
    setActiveState(next);
    if (!next) setQueryState("");
  }, []);

  const setQuery = useCallback((next: string) => {
    setQueryState(next);
  }, []);

  const value = useMemo<EntitySearchValue>(
    () => ({ active, setActive, query, setQuery }),
    [active, setActive, query, setQuery],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEntitySearch(): EntitySearchValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useEntitySearch must be used within EntitySearchProvider");
  return v;
}

export function useEntitySearchSafe(): EntitySearchValue | null {
  return useContext(Ctx);
}

export function EntitySearchToggle({
  onEnsurePanelOpen,
}: {
  onEnsurePanelOpen?: () => void;
}) {
  const { active, setActive } = useEntitySearch();
  if (typeof document === "undefined") return null;
  if (active) return null;
  return createPortal(
    <button
      type="button"
      data-entity-search-chrome=""
      onClick={() => {
        onEnsurePanelOpen?.();
        setActive(true);
      }}
      aria-label="Search"
      title="Search"
      className="fixed top-[6px] z-[200] grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-ink"
      style={{ left: SEARCH_BTN_LEFT }}
    >
      <Search className="h-4 w-4" />
    </button>,
    document.body,
  );
}

export function EntitySearchInput() {
  const { active, query, setQuery, setActive } = useEntitySearch();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (active) {
      const id = window.requestAnimationFrame(() => inputRef.current?.focus());
      return () => window.cancelAnimationFrame(id);
    }
    return;
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActive(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, setActive]);

  if (typeof document === "undefined") return null;
  if (!active) return null;

  return createPortal(
    <div
      data-entity-search-chrome=""
      data-left-panel-search=""
      className="fixed top-[6px] z-[200] flex h-7 items-center rounded-md bg-secondary pr-1 text-ink"
      style={{ left: SEARCH_BTN_LEFT, width: SEARCH_INPUT_WIDTH }}
    >
      <button
        type="button"
        onClick={() => {
          setQuery("");
          setActive(false);
        }}
        aria-label="Close search"
        title="Close search"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink"
      >
        <Search className="h-4 w-4" />
      </button>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search"
        className="min-w-0 flex-1 bg-transparent text-[12px] text-ink placeholder:text-muted-foreground/70 focus:outline-none"
      />
      <button
        type="button"
        onClick={() => {
          setQuery("");
          setActive(false);
        }}
        aria-label="Close search"
        data-search-clear=""
        className="ml-1 grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-white/60 hover:text-ink"
      >
        <X className="h-3 w-3" />
      </button>
    </div>,
    document.body,
  );
}

export type EntitySearchPerson = {
  kind: "admin" | "member";
  admin?: EntityAdministrator;
  member?: EntityMember;
};

function personDisplayName(name: string, surname: string) {
  return `${name} ${surname}`.replace(/\s+/g, " ").trim();
}

function matchesQuery(hay: string, q: string) {
  return hay.toLowerCase().includes(q);
}


function SearchUserIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5 shrink-0">
      <circle cx="8" cy="3.85" r="3.1" fill="#AEAEB2" />
      <path
        d="M3.15 13.35A4.85 4.85 0 0 1 12.85 13.35L12.85 14H3.15v-.65Z"
        fill="#AEAEB2"
      />
    </svg>
  );
}

export function EntitySearchResults({
  groups,
  admins,
  members,
  renamingId,
  renameValue,
  setRenameValue,
  onCommitRename,
  onCancelRename,
  onRename,
  onDeleteGroup,
  onColorChange,
  onEditAdmin,
  onEditMember,
}: {
  groups: EntityGroup[];
  admins: EntityAdministrator[];
  members: EntityMember[];
  renamingId: string | null;
  renameValue: string;
  setRenameValue: (v: string) => void;
  onCommitRename: (group: EntityGroup) => void;
  onCancelRename: (group: EntityGroup) => void;
  onRename: (group: EntityGroup) => void;
  onDeleteGroup: (group: EntityGroup) => void;
  onColorChange: (group: EntityGroup, hex: string) => void;
  onEditAdmin: (row: EntityAdministrator) => void;
  onEditMember: (row: EntityMember) => void;
}) {
  const { query } = useEntitySearch();
  const trimmed = query.trim();
  const q = trimmed.toLowerCase();

  const matchingGroups = useMemo(() => {
    if (!q) return [] as EntityGroup[];
    return groups.filter((g) => matchesQuery(g.name, q));
  }, [groups, q]);

  const matchingPeople = useMemo(() => {
    if (!q) return [] as EntitySearchPerson[];
    const people: EntitySearchPerson[] = [];
    const sortKey = (name: string, surname: string) =>
      `${surname || name} ${name}`.toLowerCase();
    const scored: { person: EntitySearchPerson; key: string }[] = [];
    for (const admin of admins) {
      const display = personDisplayName(admin.name, admin.surname);
      if (
        matchesQuery(display, q) ||
        matchesQuery(admin.name, q) ||
        matchesQuery(admin.surname, q)
      ) {
        scored.push({
          person: { kind: "admin", admin },
          key: sortKey(admin.name, admin.surname),
        });
      }
    }
    for (const member of members) {
      const display = personDisplayName(member.name, member.surname);
      if (
        matchesQuery(display, q) ||
        matchesQuery(member.name, q) ||
        matchesQuery(member.surname, q)
      ) {
        scored.push({
          person: { kind: "member", member },
          key: sortKey(member.name, member.surname),
        });
      }
    }
    scored.sort((a, b) => a.key.localeCompare(b.key));
    for (const row of scored) people.push(row.person);
    return people;
  }, [admins, members, q]);

  if (!trimmed) {
    return (
      <div className="px-3 pt-2 text-[11px] text-muted-foreground">
        Start typing to search groups and members…
      </div>
    );
  }

  if (matchingGroups.length === 0 && matchingPeople.length === 0) {
    return (
      <div className="px-3 pt-2 text-[11px] text-muted-foreground">
        No groups or members match "{trimmed}".
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {matchingGroups.map((group) => (
        <SearchGroupRow
          key={`group:${group.id}`}
          group={group}
          renaming={renamingId === group.id}
          renameValue={renameValue}
          setRenameValue={setRenameValue}
          onCommitRename={() => onCommitRename(group)}
          onCancelRename={() => onCancelRename(group)}
          onRename={() => onRename(group)}
          onDelete={() => onDeleteGroup(group)}
          onColorChange={(hex) => onColorChange(group, hex)}
        />
      ))}
      {matchingPeople.map((person) => {
        if (person.kind === "admin" && person.admin) {
          return (
            <SearchPersonRow
              key={`admin:${person.admin.id}`}
              name={person.admin.name}
              surname={person.admin.surname}
              pending={person.admin.status === "pending"}
              onEdit={() => onEditAdmin(person.admin!)}
            />
          );
        }
        if (person.kind === "member" && person.member) {
          return (
            <SearchPersonRow
              key={`member:${person.member.id}`}
              name={person.member.name}
              surname={person.member.surname}
              pending={person.member.status === "pending"}
              onEdit={() => onEditMember(person.member!)}
            />
          );
        }
        return null;
      })}
    </div>
  );
}

function SearchGroupRow({
  group,
  renaming,
  renameValue,
  setRenameValue,
  onCommitRename,
  onCancelRename,
  onRename,
  onDelete,
  onColorChange,
}: {
  group: EntityGroup;
  renaming: boolean;
  renameValue: string;
  setRenameValue: (v: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onRename: () => void;
  onDelete: () => void;
  onColorChange: (hex: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const renameStartedAtRef = useRef(0);
  useEffect(() => {
    if (!renaming) return;
    renameStartedAtRef.current = Date.now();
    const focusAndMark = () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    focusAndMark();
    const frame = requestAnimationFrame(focusAndMark);
    return () => cancelAnimationFrame(frame);
  }, [renaming]);

  const color = group.color || DEFAULT_GROUP_COLOR;

  return (
    <div
      className={cn(
        "group flex h-[22px] cursor-default select-none items-center gap-1 rounded-md px-2 text-[12px] text-ink",
        renaming ? "ring-1 ring-inset ring-hairline" : "hover:bg-secondary/60",
      )}
    >
      <GroupMembersIcon />
      {renaming ? (
        <input
          ref={inputRef}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={() => {
            if (Date.now() - renameStartedAtRef.current < 250) {
              requestAnimationFrame(() => inputRef.current?.focus());
              return;
            }
            onCommitRename();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommitRename();
            else if (e.key === "Escape") onCancelRename();
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="min-w-0 flex-1 cursor-text bg-transparent outline-none"
          aria-label="Group name"
        />
      ) : (
        <span className="min-w-0 flex-1 cursor-default truncate" title={group.name}>
          {group.name}
        </span>
      )}
      <CategoryActionsMenu
        trigger={
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center text-muted-foreground hover:text-ink"
            aria-label="Group actions"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        }
        currentColor={color}
        onColorChange={onColorChange}
        onRename={onRename}
        onDelete={onDelete}
      />
    </div>
  );
}

function SearchPersonRow({
  name,
  surname,
  pending,
  onEdit,
}: {
  name: string;
  surname: string;
  pending: boolean;
  onEdit: () => void;
}) {
  const label = personDisplayName(name, surname);
  return (
    <div className="flex h-[22px] cursor-default select-none items-center gap-1 rounded-md px-2 text-[12px] text-ink hover:bg-secondary/60">
      <SearchUserIcon />
      <span className="min-w-0 flex-1 cursor-default truncate" title={label}>
        {label}
      </span>
      {pending ? (
        <span className="shrink-0 whitespace-nowrap text-[11px] text-[#AEAEB2]">
          Pending
        </span>
      ) : (
        <button
          type="button"
          aria-label="Edit"
          onClick={onEdit}
          onPointerDown={(e) => e.stopPropagation()}
          className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center text-muted-foreground hover:text-ink"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
