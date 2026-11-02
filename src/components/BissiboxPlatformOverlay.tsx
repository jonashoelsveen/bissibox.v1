import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { HomeIcon } from "@/components/HomeIcon";
import {
  BISSIBOX_SIGNED_IN_SCREEN_NOTICE,
  CLOUD_PAGE_BG,
  HERO_ILLUSTRATION_DISPLAY_PX,
  HERO_ILLUSTRATION_DISPLAY_VW,
  landingHeroBodyStyle,
  landingHeroSectionPadding,
  landingHeroTitleStyle,
  landingPrimaryButtonStyle,
  MINIMAL_TOP_TAB_BAR_HEIGHT,
  MINIMAL_TOP_TAB_BAR_PADDING_X,
} from "@/lib/cloud-landing-design";

/**
 * Covers the signed-in platform on a phone, portrait and landscape, without
 * unmounting the app. Visibility is CSS (`bissibox-platform-overlay`).
 */
export function BissiboxPlatformOverlay() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;

  const logOut = () => {
    void signOut().then(() => {
      void navigate({ to: "/", resetScroll: true });
    });
  };

  const illustrationWidth = `min(${HERO_ILLUSTRATION_DISPLAY_PX}px, ${HERO_ILLUSTRATION_DISPLAY_VW}vw)`;

  return (
    <div
      className="bissibox-platform-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bissibox-compact-title"
      aria-describedby="bissibox-compact-notice"
    >
      <div
        className="flex shrink-0 items-center"
        style={{
          height: MINIMAL_TOP_TAB_BAR_HEIGHT,
          paddingLeft: MINIMAL_TOP_TAB_BAR_PADDING_X,
          paddingRight: MINIMAL_TOP_TAB_BAR_PADDING_X,
          backgroundColor: CLOUD_PAGE_BG,
        }}
      >
        <HomeIcon />
      </div>
      <div
        className="bissibox-platform-copy mx-auto flex w-full max-w-6xl flex-1 flex-col items-center px-6 text-center"
        style={landingHeroSectionPadding(false, true)}
      >
        <div className="mb-7 flex w-full justify-center overflow-visible sm:mb-9">
          <img
            src="/bissibox-cloud-hero.png"
            alt=""
            width={585}
            height={549}
            decoding="async"
            draggable={false}
            className="bissibox-platform-hero pointer-events-none max-w-full select-none object-contain"
            style={{
              width: illustrationWidth,
              maxWidth: "100%",
              height: "auto",
              overflow: "visible",
            }}
          />
        </div>
        <h1 id="bissibox-compact-title" className="tracking-tight" style={landingHeroTitleStyle}>
          Bissibox
        </h1>
        <p id="bissibox-compact-notice" className="mt-5" style={landingHeroBodyStyle}>
          {BISSIBOX_SIGNED_IN_SCREEN_NOTICE}
        </p>
        <button
          type="button"
          onClick={logOut}
          className="mt-10 text-white transition active:scale-[0.98]"
          style={landingPrimaryButtonStyle}
        >
          Log out
        </button>
      </div>
    </div>
  );
}
