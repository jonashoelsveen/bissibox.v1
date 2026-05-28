// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

async function verifyCode(code: string, stored: string): Promise<boolean> {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const data = new TextEncoder().encode(`${salt}:${code}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  // constant-time compare
  if (hash.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Body {
  attempt_id: string;
  code: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userRes.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const user = userRes.user;
    const body = (await req.json()) as Body;
    if (!body.attempt_id || !body.code) {
      return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: attempt, error: attErr } = await admin
      .from("verification_attempts")
      .select("*")
      .eq("id", body.attempt_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (attErr || !attempt) {
      return new Response(JSON.stringify({ error: "Invalid session" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (attempt.consumed_at) {
      return new Response(JSON.stringify({ error: "Code already used" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (new Date(attempt.expires_at).getTime() < Date.now()) {
      return new Response(JSON.stringify({ error: "Code expired. Request a new one." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (attempt.attempts >= attempt.max_attempts) {
      return new Response(JSON.stringify({ error: "Too many attempts. Request a new code." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const ok = await verifyCode(body.code, attempt.code_hash);
    if (!ok) {
      const newAttempts = attempt.attempts + 1;
      await admin
        .from("verification_attempts")
        .update({ attempts: newAttempts })
        .eq("id", attempt.id);
      const remaining = attempt.max_attempts - newAttempts;
      return new Response(
        JSON.stringify({ error: `Wrong code. ${remaining} attempt${remaining === 1 ? "" : "s"} left.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Mark consumed and create the registration / membership
    await admin
      .from("verification_attempts")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", attempt.id);

    const meta = (attempt.target_meta ?? {}) as Record<string, any>;

    if (attempt.target_kind === "team_membership") {
      const teamId = attempt.target_id as string;
      const tierId: string | null = meta.tier_id ?? null;
      const requestedGroupId: string | null = meta.group_id ?? null;

      // Load tier mode (if tier provided) for assignment_mode + criteria_label
      let tierMode: "volunteer" | "criteria" = "volunteer";
      let criteriaLabel = "age";
      let tierName: string | null = null;
      if (tierId) {
        const { data: tier } = await admin
          .from("team_membership_tiers")
          .select("name, group_assignment_mode, criteria_label, is_active, is_public")
          .eq("id", tierId)
          .maybeSingle();
        if (tier) {
          if ((tier as any).is_active !== true || (tier as any).is_public !== true) {
            return new Response(JSON.stringify({ error: "This membership is not available." }), {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          tierMode = ((tier as any).group_assignment_mode === "criteria" ? "criteria" : "volunteer");
          criteriaLabel = (tier as any).criteria_label ?? "age";
          tierName = (tier as any).name ?? null;
        } else {
          return new Response(JSON.stringify({ error: "This membership is not available." }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        return new Response(JSON.stringify({ error: "Choose a membership before joining." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Load team's groups (for auto-assignment + default group + leader info)
      const { data: groupsData } = await admin
        .from("team_groups")
        .select("id, name, age_from, age_to, is_default, leader_name, leader_email, leader_phone, description")
        .eq("team_id", teamId)
        .order("sort_order", { ascending: true });
      const groups = (groupsData ?? []) as Array<{
        id: string; name: string; age_from: number | null; age_to: number | null;
        is_default: boolean; leader_name: string | null; leader_email: string | null;
        leader_phone: string | null; description: string | null;
      }>;

      // Determine assigned group
      let assignedGroupId: string | null = null;
      let autoCreatedDefault = false;

      if (groups.length > 0) {
        if (tierMode === "volunteer" && requestedGroupId) {
          if (groups.find((g) => g.id === requestedGroupId)) {
            assignedGroupId = requestedGroupId;
          }
        } else if (tierMode === "criteria") {
          // Auto-assign by age range using profile.birth_date
          const { data: prof } = await admin
            .from("profiles")
            .select("birth_date")
            .eq("id", user.id)
            .maybeSingle();
          const birth = (prof as any)?.birth_date as string | null | undefined;
          if (birth) {
            const birthYear = new Date(birth).getFullYear();
            const age = new Date().getFullYear() - birthYear;
            const match = groups.find((g) => {
              const lo = g.age_from ?? -Infinity;
              const hi = g.age_to ?? Infinity;
              return age >= lo && age <= hi;
            });
            if (match) assignedGroupId = match.id;
          }
          if (!assignedGroupId) {
            // Find or create default group
            let def = groups.find((g) => g.is_default);
            if (!def) {
              const { data: newDef, error: defErr } = await admin
                .from("team_groups")
                .insert({
                  team_id: teamId,
                  name: "Default Group",
                  description: "Members whose age does not fit any defined group land here automatically.",
                  is_default: true,
                  sort_order: groups.length,
                })
                .select("id, name, age_from, age_to, is_default, leader_name, leader_email, leader_phone, description")
                .single();
              if (defErr) throw defErr;
              def = newDef as any;
              autoCreatedDefault = true;
              groups.push(def!);
            }
            assignedGroupId = def!.id;
          }
        }
      }

      // Avoid duplicate membership
      let existingQuery = admin
        .from("team_memberships")
        .select("id")
        .eq("user_id", user.id)
        .eq("team_id", teamId);
      existingQuery = tierId ? existingQuery.eq("tier_id", tierId) : existingQuery.is("tier_id", null);
      const { data: existing } = await existingQuery.maybeSingle();
      if (!existing) {
        const { error } = await admin.from("team_memberships").insert({
          user_id: user.id,
          team_id: teamId,
          tier_id: tierId,
          group_id: assignedGroupId,
          status: "active",
        });
        if (error) throw error;
      } else if (assignedGroupId) {
        await admin
          .from("team_memberships")
          .update({ group_id: assignedGroupId })
          .eq("id", (existing as any).id);
      }

      // Ensure team_members roster row
      const { data: existingMember } = await admin
        .from("team_members")
        .select("id")
        .eq("user_id", user.id)
        .eq("team_id", teamId)
        .maybeSingle();
      if (!existingMember) {
        const { error: tmErr } = await admin.from("team_members").insert({
          user_id: user.id, team_id: teamId, accepted: true,
        });
        if (tmErr) throw tmErr;
      } else {
        await admin.from("team_members").update({ accepted: true }).eq("id", (existingMember as any).id);
      }

      // Insert team_group_members link
      if (assignedGroupId) {
        const { data: existingLink } = await admin
          .from("team_group_members")
          .select("id")
          .eq("team_id", teamId)
          .eq("group_id", assignedGroupId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (!existingLink) {
          await admin.from("team_group_members").insert({
            team_id: teamId, group_id: assignedGroupId, user_id: user.id,
          });
        }
      }

      // Build response with team + group + leader info for confirmation dialog
      const { data: team } = await admin
        .from("teams")
        .select("name, contact_email, contact_phone")
        .eq("id", teamId)
        .maybeSingle();

      const assignedGroup = assignedGroupId ? groups.find((g) => g.id === assignedGroupId) ?? null : null;

      // Compute user's birth year for criteria wording
      let birthYear: number | null = null;
      if (tierMode === "criteria") {
        const { data: prof } = await admin
          .from("profiles").select("birth_date").eq("id", user.id).maybeSingle();
        const b = (prof as any)?.birth_date as string | null | undefined;
        if (b) birthYear = new Date(b).getFullYear();
      }

      return new Response(JSON.stringify({
        ok: true,
        kind: "team_membership",
        team: team ? { name: (team as any).name, contact_email: (team as any).contact_email, contact_phone: (team as any).contact_phone } : null,
        tier: tierName ? { name: tierName, mode: tierMode, criteria_label: criteriaLabel } : null,
        group: assignedGroup ? {
          id: assignedGroup.id,
          name: assignedGroup.name,
          age_from: assignedGroup.age_from,
          age_to: assignedGroup.age_to,
          is_default: assignedGroup.is_default,
          leader_name: assignedGroup.leader_name,
          leader_email: assignedGroup.leader_email,
          leader_phone: assignedGroup.leader_phone,
        } : null,
        all_groups: groups.map((g) => ({ id: g.id, name: g.name })),
        birth_year: birthYear,
        auto_created_default: autoCreatedDefault,
        assignment_mode: tierMode,
        criteria_label: criteriaLabel,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (attempt.target_kind === "event_registration") {
      const eventId = attempt.target_id;
      const subeventId = meta.subevent_id ?? null;
      const classCode = meta.class_code ?? null;
      const raceType = meta.race_type ?? "";
      const consent = !!meta.consent_share_data;
      const { data: existing } = await admin
        .from("registrations")
        .select("id")
        .eq("user_id", user.id)
        .eq("event_id", eventId)
        .maybeSingle();
      if (!existing) {
        const { error } = await admin.from("registrations").insert({
          user_id: user.id,
          event_id: eventId,
          subevent_id: subeventId,
          class_code: classCode,
          race_type: raceType,
          consent_share_data: consent,
          status: "pending",
        });
        if (error) throw error;
      }
      return new Response(JSON.stringify({ ok: true, kind: "event_registration" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (attempt.target_kind === "account_signup") {
      return new Response(JSON.stringify({ ok: true, kind: "account_signup" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown target" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("verify-otp error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
