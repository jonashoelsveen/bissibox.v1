import type { ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { accountHomeSearch } from "@/lib/app-surface";
import {
  accountNavActiveStyle,
  accountNavLabelStyle,
  accountNavSignOutStyle,
  ACCOUNT_PAGE_MAX_WIDTH,
  CLOUD_PAGE_BG,
  HELVETICA_STACK,
  MINIMAL_TOP_TAB_BAR_HEIGHT,
} from "@/lib/cloud-landing-design";
import { ACCOUNT_SECTIONS, type AccountSectionId } from "@/lib/account-route";
import { isEntityFeatureEnabled } from "@/lib/features";

export function AccountNav({
  active,
  inPanel = false,
}: {
  active: AccountSectionId;
  inPanel?: boolean;
}) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const items = ACCOUNT_SECTIONS.flatMap((section) => {
    /** Entity memberships tab — Bucket A: currently live, hidden this round. */
    if (section.id === "family" && !isEntityFeatureEnabled("entityMembershipManagement")) {
      return [];
    }
    /** Profiles → Profile when entity profiles are flagged off — Bucket A. */
    if (section.id === "profiles" && !isEntityFeatureEnabled("entityProfiles")) {
      return [{ ...section, label: "Profile", title: "Profile" }];
    }
    return [section];
  });
  return (
    <nav
      className={
        inPanel
          ? "w-full"
          : "hidden w-full shrink-0 min-[640px]:sticky min-[640px]:block min-[640px]:w-[220px] min-[640px]:self-start"
      }
      style={{
        fontFamily: HELVETICA_STACK,
        top: 0,
      }}
      aria-label="Account"
    >
      <NavGroup items={items} active={active} />
      <div className="h-6" aria-hidden />
      <ul className="flex flex-col gap-0.5">
        <li>
          <button
            type="button"
            onClick={() => {
              void (async () => {
                await signOut();
                void navigate({ to: "/", search: accountHomeSearch(), replace: true });
              })();
            }}
            className="block w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-black/[0.04]"
            style={accountNavSignOutStyle}
          >
            Sign out
          </button>
        </li>
      </ul>
    </nav>
  );
}

function NavGroup({
  items,
  active,
}: {
  items: Array<(typeof ACCOUNT_SECTIONS)[number]>;
  active: AccountSectionId;
}) {
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => {
        const isActive = item.id === active;
        return (
          <li key={item.id}>
            <Link
              to={item.path}
              className="block rounded-md px-2 py-1.5 transition-colors hover:bg-black/[0.04]"
              style={isActive ? accountNavActiveStyle : accountNavLabelStyle}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function AccountLayout({
  active,
  children,
}: {
  active: AccountSectionId;
  children: ReactNode;
}) {
  return (
    <div
      className="min-h-full w-full pb-8"
      style={{ backgroundColor: CLOUD_PAGE_BG, fontFamily: HELVETICA_STACK }}
    >
      <div
        className="mx-auto flex w-full flex-col gap-8 px-6 pb-16 min-[640px]:flex-row min-[640px]:gap-12"
        style={{
          maxWidth: ACCOUNT_PAGE_MAX_WIDTH,
          paddingTop: MINIMAL_TOP_TAB_BAR_HEIGHT + 24,
        }}
      >
        <AccountNav active={active} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
