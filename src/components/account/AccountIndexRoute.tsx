import { useEffect, useLayoutEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { AccountLandingPage } from "@/components/account/AccountLandingPage";
import { restoreCloudHomeScroll } from "@/components/CloudLandingSection";
import { CLOUD_PAGE_BG } from "@/lib/cloud-landing-design";

/** Account host entry: landing when logged out, redirect to /me when logged in. */
export function AccountIndexRoute() {
  const { user, authReady } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (authReady && user) {
      void navigate({ to: "/me", replace: true });
    }
  }, [authReady, user, navigate]);

  if (!authReady) {
    return <div className="min-h-full w-full" style={{ backgroundColor: CLOUD_PAGE_BG }} />;
  }

  if (user) {
    return <div className="min-h-full w-full" style={{ backgroundColor: CLOUD_PAGE_BG }} />;
  }

  return <AccountLandingHome />;
}

function AccountLandingHome() {
  useLayoutEffect(() => {
    restoreCloudHomeScroll();
  }, []);
  return <AccountLandingPage />;
}
