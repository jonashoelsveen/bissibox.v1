import { useEffect, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { SignInModal, type SignInContext } from "@/components/SignInModal";
import { CloudPageWithFooter } from "@/components/CloudFooter";
import { saveCloudHomeScroll } from "@/components/CloudLandingSection";
import { ENTITY_INVITE_STORAGE_KEY } from "@/components/entity/EntityInviteGate";
import { accountHomeSearch } from "@/lib/app-surface";
import { isEntityFeatureEnabled } from "@/lib/features";
import {
  HELVETICA_STACK,
  landingHeroBodyStyle,
  landingHeroSectionPadding,
  landingHeroTitleStyle,
  landingPrimaryButtonStyle,
  landingReadMoreClassName,
} from "@/lib/cloud-landing-design";

const ACCOUNT_OPEN_SIGNIN = "aponna-account-open-signin";

export function requestAccountSignIn() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ACCOUNT_OPEN_SIGNIN));
}

export function AccountLandingPage() {
  const search = useSearch({ from: "/" });
  const navigate = useNavigate();
  const { user } = useAuth();
  const [signInOpen, setSignInOpen] = useState(false);

  useEffect(() => {
    if (user) setSignInOpen(false);
  }, [user]);

  useEffect(() => {
    const open = () => setSignInOpen(true);
    window.addEventListener(ACCOUNT_OPEN_SIGNIN, open);
    return () => window.removeEventListener(ACCOUNT_OPEN_SIGNIN, open);
  }, []);

  useEffect(() => {
    /** Invite token on account landing — Bucket A: currently live, hidden this round. */
    if (search.invite && isEntityFeatureEnabled("entityInviteFlow")) {
      sessionStorage.setItem(ENTITY_INVITE_STORAGE_KEY, search.invite);
    }
    const ctx = search.signin;
    if (
      ctx === "account" ||
      ctx === "cloud" ||
      (search.invite && isEntityFeatureEnabled("entityInviteFlow"))
    ) {
      setSignInOpen(true);
    }
  }, [search.signin, search.invite]);

  const closeSignIn = () => {
    setSignInOpen(false);
    if (search.signin) {
      void navigate({
        to: "/",
        search: {
          ...accountHomeSearch(),
          ...(search.invite ? { invite: search.invite } : {}),
        },
        replace: true,
      });
    }
  };

  const openSignIn = () => setSignInOpen(true);

  return (
    <CloudPageWithFooter showLegalLinks={false} style={{ fontFamily: HELVETICA_STACK }}>
      <div className="mx-auto flex max-w-6xl flex-col items-center px-6">
        <div
          className="flex w-full flex-col items-center text-center"
          style={landingHeroSectionPadding(false, true)}
        >
          <div className="mb-7 flex w-full justify-center overflow-visible sm:mb-9">
            <img
              src="/aponna-account-hero.png"
              alt=""
              width={585}
              height={549}
              decoding="async"
              fetchPriority="high"
              draggable={false}
              className="pointer-events-none max-w-full select-none object-contain"
              style={{
                height: 629,
                width: "auto",
                maxWidth: "100%",
                overflow: "visible",
              }}
            />
          </div>
          <h1 className="tracking-tight" style={landingHeroTitleStyle}>
            Bissibox-account
          </h1>
          <p className="mt-5" style={landingHeroBodyStyle}>
            Your key to the Bissibox platform.{" "}
            <Link
              to="/account"
              resetScroll
              className={landingReadMoreClassName}
              onClick={saveCloudHomeScroll}
            >
              Read more
            </Link>
          </p>
          <button
            type="button"
            onClick={openSignIn}
            className="mt-10 text-white transition active:scale-[0.98]"
            style={landingPrimaryButtonStyle}
          >
            Log in
          </button>
        </div>
      </div>

      <SignInModal open={signInOpen} onClose={closeSignIn} context="account" />
    </CloudPageWithFooter>
  );
}

/** Re-export for route search validation. */
export type AccountSignInSearch = { signin?: SignInContext };
