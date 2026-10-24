import { redirect } from "@tanstack/react-router";
import { getAppSurface } from "@/lib/app-surface";

type GuardOpts = {
  request?: Request;
  /** When true, unauthenticated users are sent to account landing (/). */
  requireAuth?: boolean;
};

type GuardContext = {
  appSurface?: "cloud" | "account";
};

/** Restrict account section routes to the account surface (host or same-origin mode). */
export function accountRouteGuard(
  opts: GuardOpts & { context?: GuardContext } = {},
) {
  if (opts.context?.appSurface === "account") return;
  if (typeof window !== "undefined" && getAppSurface() === "account") return;
  // SSR without account host/query: defer so same-origin surface cookie can apply on client.
  if (typeof window === "undefined") return;
  throw redirect({ to: "/", search: { surface: "account" } });
}

export type AccountSectionId = "me" | "profiles" | "family";

export const ACCOUNT_SECTIONS: Array<{
  id: AccountSectionId;
  label: string;
  path: string;
  title: string;
  description: string;
}> = [
  {
    id: "me",
    label: "Account info",
    path: "/me",
    title: "Account info",
    description: "",
  },
  {
    id: "profiles",
    label: "Profiles",
    path: "/profiles",
    title: "Profiles",
    description: "",
  },
  {
    id: "family",
    label: "Memberships",
    path: "/family",
    title: "Memberships",
    description: "Entities you belong to in the Bissibox ecosystem.",
  },
];
