import { createFileRoute, useSearch, useNavigate, Navigate } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { SignInModal, type SignInContext } from "@/components/SignInModal";
import { CloudPageWithFooter } from "@/components/CloudFooter";
import { CloudLandingSection, CLOUD_OPEN_SIGNIN, restoreCloudHomeScroll } from "@/components/CloudLandingSection";
import { AccountIndexRoute } from "@/components/account/AccountIndexRoute";
import { clearAccountSurfacePreference, useAppSurface } from "@/lib/app-surface";
import { isEntityFeatureEnabled } from "@/lib/features";
import {
  CLOUD_PAGE_BG,
  HELVETICA_STACK,
  LANDING_COMPACT_ILLUSTRATION_PAD_TOP,
  LANDING_DARK_BAND_GAP_ABOVE,
  LANDING_DARK_SECTION_BG,
  landingHeroPadding,
} from "@/lib/cloud-landing-design";
import { Route as RootRoute } from "./__root";

export const Route = createFileRoute("/")({
  component: HomePage,
  validateSearch: (
    s: Record<string, unknown>,
  ): { signin?: SignInContext; invite?: string; surface?: "account" } => {
    const v = s.signin;
    const signin =
      v === "cloud" || v === "calendar" || v === "entity" || v === "account"
        ? v
        : undefined;
    const invite = typeof s.invite === "string" && s.invite.trim() ? s.invite.trim() : undefined;
    const surface = s.surface === "account" ? "account" : undefined;
    return {
      ...(signin ? { signin } : {}),
      ...(invite ? { invite } : {}),
      ...(surface ? { surface } : {}),
    };
  },
  head: ({ match }) => {
    const isAccount =
      (match.context as { appSurface?: string } | undefined)?.appSurface === "account";
    return {
      meta: isAccount
        ? [
            { title: "Bissibox Account" },
            {
              name: "description",
              content: "Your identity across the Bissibox platform.",
            },
          ]
        : [
            { title: "Bissibox" },
            {
              name: "description",
              content: "Bissibox — Manage your output.",
            },
          ],
    };
  },
});

function HomePage() {
  const { appSurface: initialSurface } = RootRoute.useRouteContext();
  const surface = useAppSurface(initialSurface);
  if (surface === "account") {
    return <AccountIndexRoute />;
  }
  return <CloudHomePage />;
}

function CloudHomePage() {
  const { user, authReady } = useAuth();
  const search = useSearch({ from: "/" });
  const navigate = useNavigate();
  const [signInOpen, setSignInOpen] = useState(false);
  const [signInContext, setSignInContext] = useState<SignInContext>("cloud");

  // Cloud home is never the account surface — drop sticky same-origin account mode.
  useEffect(() => {
    clearAccountSurfacePreference();
  }, []);
  useLayoutEffect(() => {
    if (!authReady || user) return;
    restoreCloudHomeScroll();
  }, [authReady, user]);
  useEffect(() => {
    if (!user) return;
    setSignInOpen(false);
  }, [user]);

  useEffect(() => {
    if (user) return;
    let ctx = search.signin;
    /** Entity sign-in context — Bucket A: only reachable from the marketing band. */
    if (ctx === "entity" && !isEntityFeatureEnabled("entityMarketing")) ctx = undefined;
    if (ctx) {
      setSignInContext(ctx);
      setSignInOpen(true);
    } else if (search.invite && isEntityFeatureEnabled("entityInviteFlow")) {
      setSignInContext("cloud");
      setSignInOpen(true);
    }
  }, [search.signin, search.invite, user]);

  useEffect(() => {
    const open = () => {
      setSignInContext("cloud");
      setSignInOpen(true);
    };
    window.addEventListener(CLOUD_OPEN_SIGNIN, open);
    return () => window.removeEventListener(CLOUD_OPEN_SIGNIN, open);
  }, []);

  const closeSignIn = () => {
    setSignInOpen(false);
    if (search.signin) {
      void navigate({
        to: "/",
        search: search.invite ? { invite: search.invite } : {},
        replace: true,
      });
    }
  };

  if (!authReady) {
    return <div className="min-h-full w-full" style={{ backgroundColor: CLOUD_PAGE_BG }} />;
  }

  if (user) {
    return <Navigate to="/calendar" replace />;
  }

  return (
    <CloudPageWithFooter showAudienceLinks showLegalLinks={false} style={{ fontFamily: HELVETICA_STACK }}>
      <div className="mx-auto flex max-w-6xl flex-col items-center px-6">
        <CloudLandingSection
          title="Bissibox"
          description="" 
          readMoreTo="/cloud/individuals"
          heroIllustrationSrc="/aponna-cloud-hero.png"
          heroIllustrationAlt=""
          heroIllustrationWidth={585}
          heroIllustrationHeight={549}
          onSignIn={() => {
            setSignInContext("cloud");
            setSignInOpen(true);
          }}
          paddingBottom={LANDING_DARK_BAND_GAP_ABOVE}
        />
      </div>
      {/** Dark “Aponna Cloud for entities” band — Bucket A: currently live, hidden this round. */}
      {isEntityFeatureEnabled("entityMarketing") ? (
      <div className="w-full" style={{ backgroundColor: LANDING_DARK_SECTION_BG }}>
        <div className="mx-auto flex max-w-6xl flex-col items-center px-6">
          <CloudLandingSection
            title="Bissibox for entities"
            description="Register your team."
            readMoreTo="/cloud/entities"
            compactTop
            onDark
            paddingTop={`calc(${landingHeroPadding.paddingBottom} + ${LANDING_COMPACT_ILLUSTRATION_PAD_TOP} - ${LANDING_DARK_BAND_GAP_ABOVE})`}
            heroIllustrationSrc="/aponna-cloud-entities-hero.png"
            heroIllustrationAlt=""
            heroIllustrationWidth={1170}
            heroIllustrationHeight={673}
            heroIllustrationScale={1.3}
            heroIllustrationOffsetY={10}
            onSignIn={() => {
              setSignInContext("entity");
              setSignInOpen(true);
            }}
          />
        </div>
      </div>
      ) : null}

      <SignInModal
        open={signInOpen}
        onClose={closeSignIn}
        context={signInContext}
      />
    </CloudPageWithFooter>
  );
}
