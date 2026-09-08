import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState, useSearch } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { SignInModal, type SignInContext } from "@/components/SignInModal";
import { accountHomeSearch, getAppSurface } from "@/lib/app-surface";
import {
  landingHeroBodyStyle,
  landingHeroSectionPadding,
  landingHeroTitleStyle,
  landingPrimaryButtonOnDarkStyle,
  landingPrimaryButtonStyle,
  landingReadMoreClassName,
  HERO_ILLUSTRATION_DISPLAY_PX,
  HERO_ILLUSTRATION_DISPLAY_VW,
} from "@/lib/cloud-landing-design";

/** 20% larger than the 24px native iOS back chevron. */
const READ_MORE_BACK_ICON_PX = Math.round(24 * 1.2);
/** Gap between the hanging back chevron and the content column. */
const READ_MORE_BACK_GAP_PX = 8;
/** Extra hang on wide viewports so the chevron sits away from the title. */
const READ_MORE_BACK_WIDE_EXTRA_PX = 40;
const READ_MORE_PAGE_PAD_X = Math.max(24, READ_MORE_BACK_ICON_PX + READ_MORE_BACK_GAP_PX);
const READ_MORE_BODY_MAX = "42rem"; // Tailwind max-w-2xl
const READ_MORE_BACK_HANG_MIN_PX = READ_MORE_BACK_ICON_PX + READ_MORE_BACK_GAP_PX;
const READ_MORE_BACK_HANG_WIDE_PX = READ_MORE_BACK_HANG_MIN_PX + READ_MORE_BACK_WIDE_EXTRA_PX;
/** Hang up to the wide offset, but never past the column's left gutter (shrink-safe). */
const READ_MORE_BACK_TRANSFORM = `translate(calc(-1 * min(${READ_MORE_BACK_HANG_WIDE_PX}px, (100vw - min(${READ_MORE_BODY_MAX}, 100vw - ${2 * READ_MORE_PAGE_PAD_X}px)) / 2)), -50%)`;

const CLOUD_READ_MORE_SIGNIN_PATHS = ["/cloud/individuals", "/cloud/entities"] as const;

function isCloudReadMorePath(
  path: string,
): path is (typeof CLOUD_READ_MORE_SIGNIN_PATHS)[number] {
  return (CLOUD_READ_MORE_SIGNIN_PATHS as readonly string[]).includes(path);
}

/** Shared `?signin=` parser for cloud landing + Read more routes. */
export function parseCloudSignInSearch(
  s: Record<string, unknown>,
): { signin?: SignInContext } {
  const v = s.signin;
  if (v === "cloud" || v === "calendar" || v === "entity" || v === "account") {
    return { signin: v };
  }
  return {};
}

export const CLOUD_OPEN_SIGNIN = "aponna-cloud-open-signin";

/** Open the in-page Cloud SignInModal without a `?signin=` navigation. */
export function requestCloudSignIn() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CLOUD_OPEN_SIGNIN));
}

const CLOUD_HOME_SCROLL_KEY = "cloud-home-scroll";

function cloudHomeScrollRoot(): HTMLElement | null {
  return document.querySelector("main");
}

function readCloudHomeScrollTop(): number {
  const main = cloudHomeScrollRoot();
  if (main && main.scrollHeight > main.clientHeight) return main.scrollTop;
  return window.scrollY;
}

function applyCloudHomeScrollTop(top: number) {
  const main = cloudHomeScrollRoot();
  if (main) main.scrollTop = top;
  window.scrollTo({ top, left: 0, behavior: "instant" });
}

/** Home chrome scrolls `main`, not the window. */
export function scrollCloudPageToTop() {
  applyCloudHomeScrollTop(0);
}

/** Drop a remembered home scroll so the brand mark can always open the front page at the top. */
export function clearCloudHomeScroll() {
  try {
    sessionStorage.removeItem(CLOUD_HOME_SCROLL_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

/** Remember home scroll before opening a Read more page. */
export function saveCloudHomeScroll() {
  try {
    sessionStorage.setItem(CLOUD_HOME_SCROLL_KEY, String(Math.round(readCloudHomeScrollTop())));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Restore home scroll after returning from Read more. No-op if nothing was saved. */
export function restoreCloudHomeScroll() {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(CLOUD_HOME_SCROLL_KEY);
    if (raw == null) return;
    sessionStorage.removeItem(CLOUD_HOME_SCROLL_KEY);
  } catch {
    return;
  }
  const top = Number.parseInt(raw, 10);
  if (!Number.isFinite(top) || top < 0) return;
  applyCloudHomeScrollTop(top);
  requestAnimationFrame(() => applyCloudHomeScrollTop(top));
}

export function CloudLandingSection({
  title,
  description,
  readMoreTo,
  onSignIn,
  compactTop = false,
  /** Optional illustration shown above the hero title (transparent PNG). */
  heroIllustrationSrc,
  heroIllustrationAlt = "",
  heroIllustrationWidth,
  heroIllustrationHeight,
  /** Scale vs the base hero size (1 = same as individuals art). */
  heroIllustrationScale = 1,
  /** Extra downward shift for the illustration only (px). */
  heroIllustrationOffsetY = 0,
  /** White type for the black entities band. */
  onDark = false,
  paddingTop,
  paddingBottom,
}: {
  title: string;
  description: ReactNode;
  readMoreTo: "/cloud/individuals" | "/cloud/entities";
  onSignIn: () => void;
  compactTop?: boolean;
  heroIllustrationSrc?: string;
  heroIllustrationAlt?: string;
  heroIllustrationWidth?: number;
  heroIllustrationHeight?: number;
  heroIllustrationScale?: number;
  heroIllustrationOffsetY?: number;
  onDark?: boolean;
  paddingTop?: string;
  paddingBottom?: string;
}) {
  const hasHeroArt = Boolean(heroIllustrationSrc);
  const illustrationWidth = `min(${HERO_ILLUSTRATION_DISPLAY_PX * heroIllustrationScale}px, ${HERO_ILLUSTRATION_DISPLAY_VW * heroIllustrationScale}vw)`;
  const typeColor = onDark ? "#ffffff" : undefined;
  const sectionPadding = {
    ...landingHeroSectionPadding(compactTop, hasHeroArt),
    ...(paddingTop ? { paddingTop } : {}),
    ...(paddingBottom ? { paddingBottom } : {}),
  };

  return (
    <div
      className="flex w-full flex-col items-center text-center"
      style={sectionPadding}
    >
      {heroIllustrationSrc ? (
        <div className="mb-7 flex w-full justify-center overflow-visible sm:mb-9">
          <img
            src={heroIllustrationSrc}
            alt={heroIllustrationAlt}
            width={heroIllustrationWidth}
            height={heroIllustrationHeight}
            decoding="async"
            fetchPriority="high"
            draggable={false}
            className="pointer-events-none max-w-full select-none object-contain"
            style={{
              width: illustrationWidth,
              maxWidth: "100%",
              height: "auto",
              overflow: "visible",
              ...(heroIllustrationOffsetY
                ? { transform: `translateY(${heroIllustrationOffsetY}px)` }
                : {}),
            }}
          />
        </div>
      ) : null}
      <h1
        className="tracking-tight"
        style={{ ...landingHeroTitleStyle, ...(typeColor ? { color: typeColor } : {}) }}
      >
        {title}
      </h1>
      <p
        className="mt-5"
        style={{ ...landingHeroBodyStyle, ...(typeColor ? { color: typeColor } : {}) }}
      >
        {description}{" "}
        <Link
          to={readMoreTo}
          resetScroll
          className={landingReadMoreClassName}
          onClick={saveCloudHomeScroll}
        >
          Read more
        </Link>
      </p>

      <button
        type="button"
        onClick={onSignIn}
        className={`mt-10 transition active:scale-[0.98] ${onDark ? "text-[#1d1d1f]" : "text-white"}`}
        style={onDark ? landingPrimaryButtonOnDarkStyle : landingPrimaryButtonStyle}
      >
        Sign in
      </button>
    </div>
  );
}

function CloudReadMoreSignIn({ pathname }: { pathname: string }) {
  const enabled = isCloudReadMorePath(pathname);
  const { user } = useAuth();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { signin?: SignInContext };
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!enabled || user) {
      setOpen(false);
      return;
    }
    setOpen(Boolean(search.signin));
  }, [enabled, search.signin, user]);

  useEffect(() => {
    if (!enabled) return;
    const open = () => setOpen(true);
    window.addEventListener(CLOUD_OPEN_SIGNIN, open);
    return () => window.removeEventListener(CLOUD_OPEN_SIGNIN, open);
  }, [enabled]);

  if (!enabled) return null;

  return (
    <SignInModal
      open={open}
      onClose={() => {
        setOpen(false);
        if (!search.signin) return;
        void navigate({
          to: pathname,
          search: {},
          replace: true,
        });
      }}
      context="cloud"
    />
  );
}

export function CloudReadMorePage({
  title,
  children,
  illustrationSrc,
  illustrationAlt = "",
  illustrationWidth,
  illustrationHeight,
  illustrationScale = 1,
  /** White type for the black entities info page. */
  onDark = false,
}: {
  title: string;
  children?: ReactNode;
  illustrationSrc?: string;
  illustrationAlt?: string;
  illustrationWidth?: number;
  illustrationHeight?: number;
  illustrationScale?: number;
  onDark?: boolean;
}) {
  const displayPx = HERO_ILLUSTRATION_DISPLAY_PX * illustrationScale;
  const displayVw = HERO_ILLUSTRATION_DISPLAY_VW * illustrationScale;
  const typeColor = onDark ? "#ffffff" : undefined;
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useLayoutEffect(() => {
    scrollCloudPageToTop();
    const frame = requestAnimationFrame(() => {
      scrollCloudPageToTop();
      requestAnimationFrame(scrollCloudPageToTop);
    });
    const t0 = window.setTimeout(scrollCloudPageToTop, 0);
    const t1 = window.setTimeout(scrollCloudPageToTop, 50);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(t0);
      window.clearTimeout(t1);
    };
  }, [pathname]);

  return (
    <>
    <div
      className="mx-auto flex w-full max-w-6xl flex-col items-center pb-16 text-center"
      style={{ paddingTop: 42, paddingLeft: READ_MORE_PAGE_PAD_X, paddingRight: READ_MORE_PAGE_PAD_X }}
    >
      <div className="relative w-full max-w-2xl">
        <h1
          className="relative tracking-tight"
          style={{ ...landingHeroTitleStyle, ...(typeColor ? { color: typeColor } : {}) }}
        >
          <Link
            to="/"
            search={getAppSurface() === "account" ? accountHomeSearch() : undefined}
            aria-label="Back"
            className="absolute top-1/2 inline-flex items-center justify-center transition-opacity hover:opacity-70"
            style={{
              color: onDark ? "#ffffff" : "#1d1d1f",
              width: READ_MORE_BACK_ICON_PX,
              height: READ_MORE_BACK_ICON_PX,
              left: 0,
              transform: READ_MORE_BACK_TRANSFORM,
            }}
          >
            {/* Material “arrow_back_ios_new” — the standard iOS back chevron. */}
            <svg
              width={READ_MORE_BACK_ICON_PX}
              height={READ_MORE_BACK_ICON_PX}
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden
            >
              <path d="M17.77 3.77 16 2 6 12l10 10 1.77-1.77L9.54 12z" />
            </svg>
          </Link>
          {title}
        </h1>
        {children ? (
          <div
            className="mt-16 space-y-5"
            style={{
              ...landingHeroBodyStyle,
              lineHeight: 1.5,
              ...(typeColor ? { color: typeColor } : {}),
            }}
          >
            {children}
          </div>
        ) : null}
      </div>
      {illustrationSrc ? (
        <img
          src={illustrationSrc}
          alt={illustrationAlt}
          width={illustrationWidth}
          height={illustrationHeight}
          decoding="async"
          draggable={false}
          className="pointer-events-none mt-12 max-w-full select-none object-contain sm:mt-16"
          style={{
            width: `min(${displayPx}px, ${displayVw}vw)`,
            maxWidth: "100%",
            height: "auto",
          }}
        />
      ) : null}
    </div>
    <CloudReadMoreSignIn pathname={pathname} />
    </>
  );
}
