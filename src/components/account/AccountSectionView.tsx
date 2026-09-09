import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { AccountLayout } from "@/components/account/AccountNav";
import { PersonalInformationPage } from "@/components/account/PersonalInformationPage";
import { AccountProfilesPage } from "@/components/account/AccountProfilesPage";
import { EntityMembershipsPage } from "@/components/account/EntityMembershipsPage";
import { CloudPageWithFooter } from "@/components/CloudFooter";
import type { AccountSectionId } from "@/lib/account-route";
import { accountHomeSearch } from "@/lib/app-surface";
import { CLOUD_PAGE_BG } from "@/lib/cloud-landing-design";

function AccountSectionContent({ id }: { id: AccountSectionId }) {
  if (id === "me") return <PersonalInformationPage />;
  if (id === "profiles") return <AccountProfilesPage />;
  return <EntityMembershipsPage />;
}

/** Renders an account section or redirects unauthenticated users to landing. */
export function AccountSectionView({ id }: { id: AccountSectionId }) {
  const { user, authReady } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (authReady && !user) {
      void navigate({ to: "/", search: accountHomeSearch(), replace: true });
    }
  }, [authReady, user, navigate]);

  if (!authReady || !user) {
    return (
      <div className="min-h-full w-full" style={{ backgroundColor: CLOUD_PAGE_BG }} />
    );
  }

  return (
    <CloudPageWithFooter showLegalLinks={false}>
      <AccountLayout active={id}>
        <AccountSectionContent id={id} />
      </AccountLayout>
    </CloudPageWithFooter>
  );
}
