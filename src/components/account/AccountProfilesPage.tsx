import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import {
  AccountFormSkeleton,
  AccountPageHeader,
} from "@/components/account/AccountFormFields";
import { OrganizationIcon } from "@/components/OrganizationIcon";
import { DeleteEntityProfileModal } from "@/components/account/DeleteEntityProfileModal";
import {
  EntityProfileFields,
  PROFILE_INPUT_ON_PANEL,
  ProfileThinLabel,
} from "@/components/profile/EntityProfileFields";
import { useProfileDisplayName } from "@/hooks/useProfileDisplayName";
import { useUserGroups } from "@/hooks/useUserGroups";
import { useAuth } from "@/lib/auth";
import {
  HELVETICA_STACK,
  accountSectionBodyStyle,
} from "@/lib/cloud-landing-design";
import { PROFILE_NAME_MAX, clipProfileName } from "@/lib/profileName";
import { isEntityFeatureEnabled } from "@/lib/features";

const INDIVIDUAL_TAB = "me";

const SECTION_TITLE: CSSProperties = {
  fontFamily: HELVETICA_STACK,
  fontSize: 22,
  fontWeight: 600,
  letterSpacing: "-0.02em",
  color: "#1d1d1f",
};

const TAB_SURFACE =
  "overflow-hidden rounded-[10px] border border-[#1d1d1f] bg-transparent";

/** Space between the tab icon/name row and the first field label. */
const TAB_EXPAND_PAD = "px-3 pb-4 pt-[14px]";

/** Collapsed individual tab + expanded name field, so Entity profiles stays put. */
const INDIVIDUAL_SECTION_MIN_H = "min-h-[9rem]";

function personalInitialFromUser(
  user: { email?: string | null; user_metadata?: Record<string, unknown> } | null,
  displayName: string,
) {
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const first = typeof meta.first_name === "string" ? meta.first_name : "";
  const last = typeof meta.last_name === "string" ? meta.last_name : "";
  return (
    first.trim()[0] ||
    last.trim()[0] ||
    displayName.trim()[0] ||
    user?.email?.trim()[0] ||
    "?"
  ).toUpperCase();
}

export function AccountProfilesPage() {
  const { user, activeEntityId, setActiveEntity } = useAuth();
  const { displayName, personalName, setDisplayName } = useProfileDisplayName();
  const { groups, loading, createGroup, patchGroup, persistGroup, deleteGroup } =
    useUserGroups();
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(
    null,
  );
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const individualNameRef = useRef<HTMLInputElement | null>(null);
  const persistTimers = useRef<Record<string, number>>({});
  const focusNameOnOpenRef = useRef(false);
  const personalInitial = personalInitialFromUser(user, displayName);
  const individualOpen = openId === INDIVIDUAL_TAB;

  useEffect(
    () => () => {
      Object.values(persistTimers.current).forEach((t) => window.clearTimeout(t));
    },
    [],
  );

  useEffect(() => {
    if (!openId || !focusNameOnOpenRef.current) return;
    focusNameOnOpenRef.current = false;
    const el = openId === INDIVIDUAL_TAB ? individualNameRef.current : nameInputRef.current;
    const focus = () => {
      el?.focus();
      el?.select();
    };
    focus();
    const frame = requestAnimationFrame(focus);
    return () => cancelAnimationFrame(frame);
  }, [openId]);

  const schedulePersist = (id: string) => {
    const prev = persistTimers.current[id];
    if (prev) window.clearTimeout(prev);
    persistTimers.current[id] = window.setTimeout(() => {
      void persistGroup(id);
    }, 400);
  };

  const handleAddEntity = async () => {
    if (creating) return;
    setCreating(true);
    try {
      let draftId: string | null = null;
      const created = await createGroup("New entity", (draft) => {
        draftId = draft.id;
        focusNameOnOpenRef.current = true;
        setOpenId(draft.id);
      });
      if (!created) {
        toast.error("Could not create this entity profile.");
        setOpenId((current) => (current === draftId ? null : current));
        return;
      }
      focusNameOnOpenRef.current = true;
      setOpenId(created.id);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteEntity = async (id: string) => {
    if (deletingId) return;
    const timer = persistTimers.current[id];
    if (timer) {
      window.clearTimeout(timer);
      delete persistTimers.current[id];
    }
    setDeletingId(id);
    const ok = await deleteGroup(id);
    setDeletingId(null);
    if (!ok) {
      toast.error("Could not delete this entity profile.");
      return;
    }
    setPendingDelete(null);
    if (activeEntityId === id) setActiveEntity(null);
    if (openId === id) setOpenId(null);
  };

  if (loading && groups.length === 0 && !displayName) {
    return (
      <section style={{ fontFamily: HELVETICA_STACK }}>
        <AccountPageHeader title="Profiles" />
        <AccountFormSkeleton />
      </section>
    );
  }

  return (
    <section style={{ fontFamily: HELVETICA_STACK }}>
      <AccountPageHeader title="Profiles" />

      <div className="mt-8 max-w-lg space-y-10">
        <section>
          <h2 className="mb-4" style={SECTION_TITLE}>
            Individual profile
          </h2>
          <div className={INDIVIDUAL_SECTION_MIN_H}>
            <div className={TAB_SURFACE}>
            <button
              type="button"
              onClick={() => {
                if (individualOpen) {
                  setOpenId(null);
                  return;
                }
                setOpenId(INDIVIDUAL_TAB);
              }}
              aria-expanded={individualOpen}
              className="flex h-11 w-full items-center gap-2.5 px-3 text-left"
              style={{
                fontFamily: HELVETICA_STACK,
                fontWeight: individualOpen ? 600 : 400,
                color: "#1d1d1f",
              }}
            >
              <span className="flex h-6 w-6 shrink-0 select-none items-center justify-center rounded-full bg-ink/10 text-[11px] font-semibold text-ink">
                {personalInitial}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">
                {personalName}
              </span>
            </button>
            {individualOpen ? (
              <div className={TAB_EXPAND_PAD}>
                <ProfileThinLabel>Profile name</ProfileThinLabel>
                <input
                  ref={individualNameRef}
                  value={displayName}
                  maxLength={PROFILE_NAME_MAX}
                  onChange={(e) => setDisplayName(clipProfileName(e.target.value))}
                  placeholder="Me"
                  className={PROFILE_INPUT_ON_PANEL}
                />
              </div>
            ) : null}
            </div>
          </div>
        </section>

        {/** Entity profiles section — Bucket A: currently live, hidden this round. */}
        {isEntityFeatureEnabled("entityProfiles") ? (
        <section>
          <div className="mb-4 flex h-8 items-center gap-2">
            <h2 className="min-w-0 flex-1" style={SECTION_TITLE}>
              Entity profiles
            </h2>
            <button
              type="button"
              onClick={() => void handleAddEntity()}
              disabled={creating}
              aria-label="Add entity profile"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[#6e6e73] transition-colors hover:bg-black/[0.06] hover:text-[#1d1d1f] disabled:opacity-50"
            >
              <Plus className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>

          {groups.length === 0 ? (
            <p style={{ ...accountSectionBodyStyle, fontSize: 14 }}>
              Create an entity profile to use it on the platform.
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {groups.map((group) => {
                const open = openId === group.id;
                return (
                  <div key={group.id} className={TAB_SURFACE}>
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : group.id)}
                      aria-expanded={open}
                      className="flex h-11 w-full items-center gap-2.5 px-3 text-left text-sm"
                      style={{
                        fontFamily: HELVETICA_STACK,
                        fontWeight: open ? 600 : 400,
                        color: "#1d1d1f",
                      }}
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center text-[#6e6e73]">
                        <OrganizationIcon className="h-5 w-5" strokeWidth={1.75} />
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {group.name.trim() || "New entity"}
                      </span>
                    </button>
                    {open ? (
                      <div className={TAB_EXPAND_PAD}>
                        <EntityProfileFields
                          group={group}
                          onPanel
                          nameInputRef={nameInputRef}
                          onDelete={
                            group.creating
                              ? undefined
                              : () =>
                                  setPendingDelete({
                                    id: group.id,
                                    name: group.name.trim() || "New entity",
                                  })
                          }
                          onPatch={(patch) => {
                            patchGroup(group.id, patch);
                            if (!group.creating) schedulePersist(group.id);
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>
        ) : null}
      </div>

      <DeleteEntityProfileModal
        open={pendingDelete != null}
        name={pendingDelete?.name ?? ""}
        deleting={pendingDelete != null && deletingId === pendingDelete.id}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        onConfirm={() => {
          if (pendingDelete) void handleDeleteEntity(pendingDelete.id);
        }}
      />
    </section>
  );
}
