import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { SignInModal } from "@/components/SignInModal";

export const Route = createFileRoute("/")({
  component: HomePage,
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
  const [signInOpen, setSignInOpen] = useState(false);

  // Logged-in Aponna Cloud home — black top tab-bar (rendered globally) + 2×2 cards.
  if (authReady && user) {
    return (
      <div
        className="min-h-full w-full"
        style={{ backgroundColor: "#fafafa", fontFamily: HELVETICA }}
      >
        <div className="mx-auto grid h-full max-w-[1600px] grid-cols-2 grid-rows-2 gap-6 px-6 py-6"
             style={{ minHeight: "calc(100vh - 80px)" }}>
          {[0, 1, 2, 3].map((i) => (
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
    );
  }

  // Landing (logged out).
  return (
    <div
      className="min-h-full w-full"
      style={{ backgroundColor: "#fafafa", fontFamily: HELVETICA }}
    >
      <div className="mx-auto flex max-w-6xl flex-col items-center px-6">
        <div
          className="flex w-full flex-col items-center text-center"
          style={{ paddingTop: "clamp(120px, 22vh, 240px)" }}
        >
          <h1
            className="font-bold tracking-tight text-[#1d1d1f]"
            style={{
              fontFamily: HELVETICA,
              fontSize: "clamp(56px, 9vw, 112px)",
              lineHeight: 1.02,
              letterSpacing: "-0.04em",
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
            onClick={() => setSignInOpen(true)}
            className="mt-10 text-white transition active:scale-[0.98]"
            style={{
              backgroundColor: "#1d1d1f",
              borderRadius: 14,
              padding: "14px 36px",
              fontFamily: HELVETICA,
              fontSize: 17,
              fontWeight: 500,
              letterSpacing: "-0.01em",
            }}
          >
            Sign in
          </button>
        </div>

        <div className="mt-24 grid w-full grid-cols-1 gap-5 pb-24 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="aspect-[4/5] w-full bg-white"
              style={{
                borderRadius: 22,
                boxShadow:
                  "0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.04)",
              }}
            />
          ))}
        </div>
      </div>

      <SignInModal open={signInOpen} onClose={() => setSignInOpen(false)} />
    </div>
  );
}
