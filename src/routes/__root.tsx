import { Outlet, createRootRoute, HeadContent, Scripts, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import appCss from "../styles.css?url";
import { AuthProvider } from "@/lib/auth";
import { TopBar } from "@/components/TopBar";
import { GlobalTopTabBar } from "@/components/GlobalTopTabBar";
import { GlobalCreateOverlay } from "@/components/GlobalCreateOverlay";
import { TopBarSlotProvider } from "@/components/TopBarSlot";
// SettingsModal removed — settings are a full page at /settings now.
import { ProfileModal } from "@/components/ProfileModal";
import { ProfileRouteMemory } from "@/components/ProfileRouteMemory";
import { Toaster } from "@/components/ui/sonner";


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

export const Route = createRootRoute({
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
    <html lang="en">
      <head>
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
  // When rendered inside an iframe (e.g. the ProfileModal), hide the global
  // chrome so only the page content is visible inside the modal.
  const [isEmbedded, setIsEmbedded] = useState(false);
  useEffect(() => {
    try {
      setIsEmbedded(window.location.hash.includes("embed=1"));
    } catch {
      setIsEmbedded(false);
    }
  }, []);


  return (
    <AuthProvider>
      <TopBarSlotProvider>
        {!isEmbedded && <ProfileRouteMemory />}
        {!isEmbedded && <TopBar />}
        {!isEmbedded && <GlobalTopTabBar />}
        <main
          className={
            isEmbedded
              ? "fixed inset-0 overflow-y-auto"
              : "fixed inset-x-0 top-10 bottom-0 overflow-y-auto"
          }
        >
          <Outlet />
        </main>
        {!isEmbedded && <Toaster />}
        {!isEmbedded && <GlobalCreateOverlay />}
        {/* SettingsModal removed — settings live at /settings */}
        {!isEmbedded && <ProfileModal />}
      </TopBarSlotProvider>
    </AuthProvider>
  );
}
