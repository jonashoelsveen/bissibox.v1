import { createFileRoute, useSearch, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { SignInModal, type SignInContext } from "@/components/SignInModal";
import { CreateEntityModal } from "@/components/CreateEntityModal";
import { CloudFooter } from "@/components/CloudFooter";

export const Route = createFileRoute("/")({
  component: HomePage,
  validateSearch: (s: Record<string, unknown>): { signin?: SignInContext } => {
    const v = s.signin;
    if (v === "cloud" || v === "calendar" || v === "entity") {
      return { signin: v };
    }
    return {};
  },
  head: () => ({
    meta: [
      { title: "Aponna Cloud" },
      {
        name: "description",
        content: "Aponna Cloud — Enjoy the past, and plan the future.",
      },
    ],
  }),
});

const HELVETICA =
  '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif';

function HomePage() {
  const { user, authReady } = useAuth();
  const search = useSearch({ from: "/" });
  const navigate = useNavigate();
  const [signInOpen, setSignInOpen] = useState(false);
  const [signInContext, setSignInContext] = useState<SignInContext>("cloud");
  const [createEntityOpen, setCreateEntityOpen] = useState(false);
  const [pendingEntityAfterSignIn, setPendingEntityAfterSignIn] = useState(false);

  useEffect(() => {
    if (!user) return;
    const wasOpen = signInOpen;
    setSignInOpen(false);
    if (pendingEntityAfterSignIn) {
      setPendingEntityAfterSignIn(false);
      setCreateEntityOpen(true);
      return;
    }
    if (!wasOpen) return;
    const target = signInContext === "calendar" ? "/calendar" : null;
    if (target) void navigate({ to: target, replace: true });
  }, [user]);


  // Open the modal automatically when arriving with ?signin=<ctx>.
  useEffect(() => {
    if (user) return;
    const ctx = search.signin;
    if (ctx) {
      setSignInContext(ctx);
      setSignInOpen(true);
    }
  }, [search.signin, user]);

  const closeSignIn = () => {
    setSignInOpen(false);
    setPendingEntityAfterSignIn(false);
    if (search.signin) {
      void navigate({ to: "/", search: {}, replace: true });
    }
  };

  const primaryButtonStyle: React.CSSProperties = {
    backgroundColor: "#1d1d1f",
    borderRadius: 14,
    padding: "14px 36px",
    fontFamily: HELVETICA,
    fontSize: 17,
    fontWeight: 500,
    letterSpacing: "-0.01em",
  };

  // Logged-in Aponna Cloud home — 2 cards side by side.
  const pendingRedirect =
    !!user && !!search.signin && search.signin !== "cloud";

  if (pendingRedirect) {
    return <div className="min-h-full w-full" style={{ backgroundColor: "#fafafa" }} />;
  }

  if (authReady && user) {
    return (
      <div
        className="min-h-full w-full"
        style={{ backgroundColor: "#fafafa", fontFamily: HELVETICA }}
      >
        <div
          className="mx-auto flex max-w-[1600px] flex-col px-6 py-6"
          style={{ minHeight: "calc(100vh - 80px)" }}
        >
          <div className="grid flex-1 grid-cols-2 gap-6">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="h-full w-full bg-white"
                style={{
                  borderRadius: 24,
                  boxShadow:
                    "0 1px 2px rgba(0,0,0,0.04), 0 10px 30px rgba(0,0,0,0.05)",
                }}
              />
            ))}
          </div>
        </div>
        <CreateEntityModal
          open={createEntityOpen}
          onClose={() => setCreateEntityOpen(false)}
        />
        <CloudFooter />
      </div>
    );
  }

  return (
    <div
      className="min-h-full w-full"
      style={{ backgroundColor: "#fafafa", fontFamily: HELVETICA }}
    >
      <div className="mx-auto flex max-w-6xl flex-col items-center px-6">

        <div
          className="flex w-full flex-col items-center text-center"
          style={{ paddingTop: "clamp(120px, 22vh, 240px)", paddingBottom: "clamp(120px, 22vh, 240px)" }}
        >
          <h1
            className="tracking-tight text-[#1d1d1f]"
            style={{
              fontFamily: HELVETICA,
              fontSize: "clamp(56px, 9vw, 112px)",
              lineHeight: 1.02,
              letterSpacing: "-0.04em",
              fontWeight: 600,
            }}
          >
            Aponna Cloud
          </h1>
          <p
            className="mt-5 text-[#1d1d1f]"
            style={{
              fontFamily: HELVETICA,
              fontSize: "clamp(17px, 1.4vw, 21px)",
              fontWeight: 400,
            }}
          >
            Enjoy the past, and plan the future.
          </p>

          <button
            type="button"
            onClick={() => {
              setSignInContext("cloud");
              setSignInOpen(true);
            }}
            className="mt-10 text-white transition active:scale-[0.98]"
            style={primaryButtonStyle}
          >
            Sign in
          </button>
        </div>
      </div>

      <SignInModal
        open={signInOpen}
        onClose={closeSignIn}
        context={signInContext}
      />
      <CreateEntityModal
        open={createEntityOpen}
        onClose={() => setCreateEntityOpen(false)}
      />
      <CloudFooter />
    </div>
  );
}
