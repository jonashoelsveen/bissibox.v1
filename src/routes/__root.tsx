import { Outlet, createRootRouteWithContext, HeadContent, Scripts, Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import appCss from "../styles.css?url";
import { AuthProvider } from "@/lib/auth";
import { TopBar } from "@/components/TopBar";
import { GlobalTopTabBar } from "@/components/GlobalTopTabBar";
import { AccountTopTabBar } from "@/components/account/AccountTopTabBar";
import { resolveAppSurface, useAppSurface } from "@/lib/app-surface";
import { GlobalCreateOverlay } from "@/components/GlobalCreateOverlay";
import { TopBarSlotProvider } from "@/components/TopBarSlot";
import { ProfileModal } from "@/components/ProfileModal";
import { ProfileRouteMemory } from "@/components/ProfileRouteMemory";
import { EntityInviteGate } from "@/components/entity/EntityInviteGate";
import { Toaster } from "@/components/ui/sonner";
import { BissiboxPlatformOverlay } from "@/components/BissiboxPlatformOverlay";
import {
  CLOUD_FOOTER_BG,
  CLOUD_PAGE_BG,
  isCloudLandingChromePath,
  MINIMAL_TOP_TAB_BAR_HEIGHT,
} from "@/lib/cloud-landing-design";
import {
  CALENDAR_THEME_BOOT_SCRIPT,
  useCalendarTheme,
} from "@/components/calendar/calendarThemePref";

export type RouterAppContext = {
  appSurface: "cloud" | "account";
};

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-display text-foreground">404</h1>
        <h2 className="mt-4 text-xl text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The race you're looking for doesn't exist.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            Back home
          </Link>
        </div>
      </div>
    </div>
  );
}

function surfaceFromLocation(location: {
  href: string;
  pathname: string;
  search: unknown;
  url?: string;
}): "cloud" | "account" {
  if (typeof window !== "undefined") {
    return resolveAppSurface({
      host: window.location.hostname,
      search: window.location.search,
      pathname: location.pathname || window.location.pathname,
    });
  }

  let host = "";
  let search = "";
  let pathname = location.pathname || "/";
  try {
    const raw = location.url ?? location.href;
    const url = new URL(raw, "http://localhost");
    host = url.hostname;
    search = url.search;
    if (url.pathname) pathname = url.pathname;
  } catch {
    /* ignore */
  }

  if (!search && location.search && typeof location.search === "object") {
    const params = new URLSearchParams(location.search as Record<string, string>);
    search = params.toString() ? `?${params.toString()}` : "";
  }

  return resolveAppSurface({ host, search, pathname, surfaceCookie: false });
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  beforeLoad: ({ location }): RouterAppContext => ({
    appSurface: surfaceFromLocation(location),
  }),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Raceline — Sign up for races, simply" },
      {
        name: "description",
        content:
          "Raceline is the calmest way to find and sign up for sports events. Search like Spotify, trust like BankID.",
      },
    ],
    links: [
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png?v=3" },
      { rel: "icon", href: "/favicon.ico?v=3" },
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=JetBrains+Mono:wght@400;500&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: CALENDAR_THEME_BOOT_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  useCalendarTheme();
  const [isEmbedded, setIsEmbedded] = useState(false);
  const { appSurface: initialSurface } = Route.useRouteContext();
  const surface = useAppSurface(initialSurface);
  const isAccount = surface === "account";
  const path = useRouterState({ select: (s) => s.location.pathname });
  const isCloudLanding = !isAccount && isCloudLandingChromePath(path);
  const isSoftOverscroll = isAccount || isCloudLanding;

  useEffect(() => {
    try {
      setIsEmbedded(window.location.hash.includes("embed=1"));
    } catch {
      setIsEmbedded(false);
    }
  }, []);

  useEffect(() => {
    if (!isSoftOverscroll) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.backgroundColor;
    const prevBody = body.style.backgroundColor;
    html.style.backgroundColor = CLOUD_PAGE_BG;
    body.style.backgroundColor = CLOUD_PAGE_BG;
    return () => {
      html.style.backgroundColor = prevHtml;
      body.style.backgroundColor = prevBody;
    };
  }, [isSoftOverscroll]);

  return (
    <AuthProvider>
      <TopBarSlotProvider>
        {!isEmbedded && !isAccount && <ProfileRouteMemory />}
        {!isEmbedded && !isAccount && <TopBar />}
        {!isEmbedded && (isAccount ? <AccountTopTabBar /> : <GlobalTopTabBar />)}
        {isSoftOverscroll ? (
          <div
            aria-hidden
            className="pointer-events-none fixed bottom-0 right-0 z-0"
            style={{
              left: "var(--topbar-left-offset, 0px)",
              height: "50vh",
              backgroundColor: CLOUD_FOOTER_BG,
            }}
          />
        ) : null}
        <main
          className={
            isEmbedded
              ? "fixed inset-0 overflow-y-auto bg-white"
              : isSoftOverscroll
                ? "fixed right-0 bottom-0 z-[1] overflow-y-auto"
                : "fixed right-0 bottom-0 overflow-y-auto bg-white"
          }
          style={
            isEmbedded
              ? undefined
              : {
                  left: "var(--topbar-left-offset, 0px)",
                  top: MINIMAL_TOP_TAB_BAR_HEIGHT,
                  ...(isSoftOverscroll ? { backgroundColor: "transparent" } : {}),
                }
          }
        >
          <Outlet />
        </main>
        {!isEmbedded && <Toaster />}
        {!isEmbedded && <EntityInviteGate />}
        {!isEmbedded && !isAccount && <GlobalCreateOverlay />}
        {!isEmbedded && !isAccount && <ProfileModal />}
        {!isEmbedded && !isAccount && <BissiboxPlatformOverlay />}
      </TopBarSlotProvider>
    </AuthProvider>
  );
}
