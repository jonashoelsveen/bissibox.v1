import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AccountSegmentIsland } from "@/components/account/AccountSegmentIsland";
import {
  AccountFormSkeleton,
  AccountPageHeader,
} from "@/components/account/AccountFormFields";
import {
  MembershipDetailModal,
  type MembershipDetail,
  type MembershipKind,
} from "@/components/account/MembershipDetailModal";
import {
  HELVETICA_STACK,
  ACTIVE_STATUS_COLOR,
  accountFieldControlStyle,
  accountHeaderActionStyle,
  accountSectionBodyStyle,
} from "@/lib/cloud-landing-design";
import { isEntityFeatureEnabled } from "@/lib/features";
import type { EntityMembershipRequest } from "@/hooks/useEntityMembershipRequests";

const ERROR_COLOR = "#FF3B30";
const MUTED_STATUS_COLOR = "#6e6e73";

const ROW_SHADOW: CSSProperties = {
  backgroundColor: "rgba(255, 255, 255, 0.96)",
  borderRadius: 12,
  border: "none",
  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.12)",
};

const NAME_STYLE: CSSProperties = {
  fontFamily: HELVETICA_STACK,
  fontSize: 17,
  fontWeight: 400,
  color: "#1d1d1f",
  lineHeight: 1.3,
};

const META_STYLE: CSSProperties = {
  fontFamily: HELVETICA_STACK,
  fontSize: 13,
  fontWeight: 400,
  color: MUTED_STATUS_COLOR,
  lineHeight: 1.35,
  marginTop: 4,
};

const STATUS_STYLE: CSSProperties = {
  fontFamily: HELVETICA_STACK,
  fontSize: 15,
  fontWeight: 400,
  lineHeight: 1.3,
  flexShrink: 0,
};

type Membership = {
  id: string;
  name: string;
  status: string;
  memberFrom: string | null;
  cancelledAt: string | null;
};

type FieldError = "not_found" | "already_member" | "already_sent" | "rate_limited" | null;

function formatMembershipDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const month = date.toLocaleString("en-US", { month: "long" });
  return `${month} ${date.getDate()}. ${date.getFullYear()}`;
}

function BrowseEntitiesButton() {
  return (
    <button
      type="button"
      style={accountHeaderActionStyle}
      className="inline-flex items-center gap-1.5"
    >
      Browse entities
      <ExternalLink className="h-4 w-4" strokeWidth={1.75} />
    </button>
  );
}

type MembershipPane = "active" | "inactive" | "pending";

function MembershipRow({
  name,
  statusLabel,
  statusColor,
  detail,
  onOpen,
}: {
  name: string;
  statusLabel: string;
  statusColor: string;
  detail: string;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="account-membership-row px-4 py-3.5"
        style={ROW_SHADOW}
      >
        <div className="flex items-start justify-between gap-4">
          <span className="min-w-0 flex-1" style={NAME_STYLE}>
            {name}
          </span>
          <span style={{ ...STATUS_STYLE, color: statusColor }}>{statusLabel}</span>
        </div>
        <div style={META_STYLE}>{detail}</div>
      </button>
    </li>
  );
}

export function EntityMembershipsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Membership[] | null>(null);
  const [pending, setPending] = useState<EntityMembershipRequest[]>([]);
  const [code, setCode] = useState("");
  const [fieldError, setFieldError] = useState<FieldError>(null);
  const [sending, setSending] = useState(false);
  const [selected, setSelected] = useState<MembershipDetail | null>(null);
  const [pane, setPane] = useState<MembershipPane>("active");

  const openMembership = (kind: MembershipKind, name: string, detail: string) => {
    setSelected({ kind, name, detail });
  };

  const load = useCallback(async () => {
    if (!user) {
      setRows([]);
      setPending([]);
      return;
    }
    const membersWithCancel = await supabase
      .from("entity_members")
      .select("id, status, team_id, created_at, cancelled_at")
      .eq("user_id", user.id)
      .in("status", ["active", "inactive"]);
    const members = membersWithCancel.error
      ? await supabase
          .from("entity_members")
          .select("id, status, team_id, created_at")
          .eq("user_id", user.id)
          .eq("status", "active")
      : membersWithCancel;
    const [requests] = await Promise.all([
      supabase
        .from("entity_membership_requests")
        .select(
          "id, team_id, requester_id, team_name, email, first_name, last_name, date_of_birth, status, deny_expires_at, decided_at, created_at",
        )
        .eq("requester_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

    const collected = (members.data ?? []).map((row) => ({
      id: row.id,
      teamId: row.team_id,
      status: row.status,
      createdAt: row.created_at,
      cancelledAt: "cancelled_at" in row ? row.cancelled_at : null,
    }));
    const teamIds = [...new Set(collected.map((r) => r.teamId))];
    const names = new Map<string, string>();
    if (teamIds.length > 0) {
      const { data: teams } = await supabase.from("app_teams").select("id, name").in("id", teamIds);
      for (const team of teams ?? []) names.set(team.id, team.name);
    }

    const next: Membership[] = [];
    const seen = new Set<string>();
    for (const row of collected) {
      const name = names.get(row.teamId)?.trim();
      if (!name || seen.has(row.id)) continue;
      seen.add(row.id);
      next.push({
        id: row.id,
        name,
        status: row.status,
        memberFrom: row.createdAt,
        cancelledAt: row.cancelledAt,
      });
    }
    next.sort((a, b) => a.name.localeCompare(b.name));
    setRows(next);
    setPending((requests.data ?? []) as EntityMembershipRequest[]);
  }, [user]);

  useEffect(() => {
    if (!user) {
      setRows([]);
      setPending([]);
      return;
    }
    let cancelled = false;
    void load().then(() => {
      if (cancelled) return;
    });
    const channel = supabase
      .channel(`account-entity-memberships:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "entity_membership_requests",
          filter: `requester_id=eq.${user.id}`,
        },
        () => {
          void load();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "entity_members",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void load();
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [user, load]);

  const sendDisabled =
    sending || !code.trim() || fieldError === "already_member" || fieldError === "already_sent";

  const handleSend = async () => {
    if (sendDisabled) return;
    setSending(true);
    setFieldError(null);
    try {
      const { data, error } = await supabase.functions.invoke("request-entity-membership", {
        body: { entity_code: code.trim().toLowerCase() },
      });
      const body = data as { ok?: boolean; error?: string; request?: EntityMembershipRequest } | null;
      const errCode = body?.error ?? (error ? "not_found" : null);
      if (!body?.ok) {
        if (errCode === "already_member") setFieldError("already_member");
        else if (errCode === "already_sent") setFieldError("already_sent");
        else if (errCode === "already") setFieldError("already_member");
        else if (errCode === "rate_limited") setFieldError("rate_limited");
        else setFieldError("not_found");
        return;
      }
      setCode("");
      if (body.request) {
        setPending((prev) => [body.request!, ...prev.filter((r) => r.id !== body.request!.id)]);
      } else {
        await load();
      }
    } finally {
      setSending(false);
    }
  };

  /** Browse entities header — Bucket B: destination not wired yet. */
  const browseEntities = isEntityFeatureEnabled("entityBrowsePage") ? (
    <BrowseEntitiesButton />
  ) : undefined;

  if (!rows) {
    return (
      <section style={{ fontFamily: HELVETICA_STACK }}>
        <AccountPageHeader title="Memberships" trailing={browseEntities} />
        <AccountFormSkeleton />
      </section>
    );
  }

  const active = rows.filter((row) => row.status === "active");
  const inactive = rows.filter((row) => row.status === "inactive");

  return (
    <section style={{ fontFamily: HELVETICA_STACK }}>
      <AccountPageHeader title="Memberships" trailing={browseEntities} />

      <div className="mt-8 flex max-w-xl items-center gap-4">
        <input
          type="text"
          value={code}
          spellCheck={false}
          autoComplete="off"
          placeholder="Paste Entity request-ID"
          aria-label="Paste Entity request-ID"
          onChange={(e) => {
            setCode(e.target.value);
            setFieldError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleSend();
          }}
          className="account-field"
          style={accountFieldControlStyle}
        />
        <button
          type="button"
          disabled={sendDisabled}
          onClick={() => void handleSend()}
          className="shrink-0"
          style={{
            ...accountHeaderActionStyle,
            color: sendDisabled ? "#c7c7cc" : "#0066cc",
            cursor: sendDisabled ? "default" : "pointer",
          }}
        >
          Send member request
        </button>
      </div>
      {fieldError === "not_found" ? (
        <p className="mt-2 max-w-xl" style={{ fontFamily: HELVETICA_STACK, fontSize: 13, color: ERROR_COLOR }}>
          No entity has this entity request-ID. Try paste another entity request-ID
        </p>
      ) : null}
      {fieldError === "already_member" ? (
        <p className="mt-2 max-w-xl" style={{ fontFamily: HELVETICA_STACK, fontSize: 13, color: ERROR_COLOR }}>
          Already a member
        </p>
      ) : null}
      {fieldError === "already_sent" ? (
        <p className="mt-2 max-w-xl" style={{ fontFamily: HELVETICA_STACK, fontSize: 13, color: ERROR_COLOR }}>
          Request already sent
        </p>
      ) : null}
      {fieldError === "rate_limited" ? (
        <p className="mt-2 max-w-xl" style={{ fontFamily: HELVETICA_STACK, fontSize: 13, color: ERROR_COLOR }}>
          Too many requests. Try again in an hour.
        </p>
      ) : null}

      <div className="mt-6 max-w-xl">
        <AccountSegmentIsland
          ariaLabel="Membership status"
          value={pane}
          onChange={setPane}
          options={[
            { id: "active", label: "Active" },
            { id: "inactive", label: "Inactive" },
            { id: "pending", label: "Pending" },
          ]}
        />
      </div>

      <div className="mt-6 max-w-xl">
        {pane === "active" ? (
          active.length === 0 ? (
            <p style={accountSectionBodyStyle}>Entities you belong to will appear here.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {active.map((row) => {
                const from = formatMembershipDate(row.memberFrom);
                return (
                  <MembershipRow
                    key={row.id}
                    name={row.name}
                    statusLabel="Active"
                    statusColor={ACTIVE_STATUS_COLOR}
                    detail={from ? `Member from ${from}` : "Member"}
                    onOpen={() =>
                      openMembership("active", row.name, from ? `Member from ${from}` : "Member")
                    }
                  />
                );
              })}
            </ul>
          )
        ) : pane === "inactive" ? (
          inactive.length === 0 ? (
            <p style={accountSectionBodyStyle}>Cancelled memberships will appear here.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {inactive.map((row) => {
                const cancelled = formatMembershipDate(row.cancelledAt);
                return (
                  <MembershipRow
                    key={row.id}
                    name={row.name}
                    statusLabel="Inactive"
                    statusColor={ERROR_COLOR}
                    detail={cancelled ? `Cancelled ${cancelled}` : "Cancelled"}
                    onOpen={() =>
                      openMembership(
                        "inactive",
                        row.name,
                        cancelled ? `Cancelled ${cancelled}` : "Cancelled",
                      )
                    }
                  />
                );
              })}
            </ul>
          )
        ) : pending.length === 0 ? (
          <p style={accountSectionBodyStyle}>
            Requests you send will appear here until they are accepted.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {pending.map((row) => {
              const sent = formatMembershipDate(row.created_at);
              const cancelledOn = formatMembershipDate(row.decided_at);
              const denied = row.status === "denied";
              const cancelled = row.status === "cancelled";
              const statusLabel = cancelled ? "Cancelled" : denied ? "Denied" : "Pending";
              const detail = cancelled
                ? cancelledOn
                  ? `Request cancelled ${cancelledOn}`
                  : "Request cancelled"
                : sent
                  ? `Request sent ${sent}`
                  : "Request sent";
              return (
                <MembershipRow
                  key={row.id}
                  name={row.team_name}
                  statusLabel={statusLabel}
                  statusColor={denied || cancelled ? ERROR_COLOR : MUTED_STATUS_COLOR}
                  detail={detail}
                  onOpen={() =>
                    openMembership(
                      cancelled ? "cancelled" : denied ? "denied" : "pending",
                      row.team_name,
                      detail,
                    )
                  }
                />
              );
            })}
          </ul>
        )}
      </div>

      <MembershipDetailModal
        open={selected != null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        detail={selected}
      />
    </section>
  );
}
