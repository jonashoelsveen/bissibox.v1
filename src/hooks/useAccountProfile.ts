import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  getAccountAccessToken,
  loadAccountProfileForUser,
} from "@/lib/account-profile-client";
import { supabase } from "@/integrations/supabase/client";

export type AccountProfile = {
  first_name: string | null;
  last_name: string | null;
  birth_date: string | null;
  email: string | null;
  mobile: string | null;
  updated_at: string;
};

async function readJson(res: Response) {
  try {
    return (await res.json()) as { error?: string; profile?: AccountProfile };
  } catch {
    return {};
  }
}

function accountAuthHeaders(accessToken: string | undefined) {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  return headers;
}

export function useAccountProfile() {
  const { authReady, user } = useAuth();
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!authReady) {
      setLoading(true);
      return;
    }

    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const next = await loadAccountProfileForUser(user);
      setProfile(next);
    } finally {
      setLoading(false);
    }
  }, [authReady, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateProfile = useCallback(
    async (
      patch: Partial<
        Pick<AccountProfile, "first_name" | "last_name" | "birth_date" | "mobile">
      >,
    ) => {
      if (!profile) return { error: "Profile not loaded" };

      const accessToken = await getAccountAccessToken();
      const body: Record<string, unknown> = { ...patch };
      if (profile.updated_at) {
        body.expected_updated_at = profile.updated_at;
      }

      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        credentials: "include",
        headers: {
          ...accountAuthHeaders(accessToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await readJson(res);
      if (!res.ok || !data.profile) {
        if (res.status === 409) {
          await load();
        }
        return { error: data.error ?? "Could not save changes" };
      }

      setProfile(data.profile);
      try {
        await supabase.auth.updateUser({
          data: {
            first_name: data.profile.first_name ?? "",
            last_name: data.profile.last_name ?? "",
            birth_date: data.profile.birth_date ?? null,
          },
        });
      } catch {
        /* session metadata is best-effort; profiles row is the source of truth */
      }
      return {};
    },
    [profile, load],
  );

  const changePassword = useCallback(
    async (
      current_password: string,
      new_password: string,
      extra?: { code: string; attempt_id: string },
    ) => {
      const accessToken = await getAccountAccessToken();
      const res = await fetch("/api/account/password", {
        method: "POST",
        credentials: "include",
        headers: {
          ...accountAuthHeaders(accessToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          current_password,
          new_password,
          ...(extra ? { code: extra.code, attempt_id: extra.attempt_id } : {}),
        }),
      });

      const data = (await readJson(res)) as {
        error?: string;
        ok?: boolean;
        code?: string;
        remaining?: number;
        pending?: boolean;
        masked?: string;
        attempt_id?: string;
      };
      if (!res.ok) {
        return {
          error: data.error ?? "Could not change password",
          ...(data.code ? { code: data.code } : {}),
          ...(typeof data.remaining === "number" ? { remaining: data.remaining } : {}),
        };
      }
      if (data.pending) {
        return {
          pending: true as const,
          masked: data.masked ?? "",
          attempt_id: data.attempt_id ?? "",
        };
      }
      return {};
    },
    [],
  );

  return {
    profile,
    loading,
    reload: load,
    updateProfile,
    changePassword,
    accountEmail: profile?.email ?? user?.email ?? "",
  };
}
