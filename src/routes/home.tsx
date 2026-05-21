import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/home")({
  component: HomePage,
  head: () => ({ meta: [{ title: "Home · Raceline" }] }),
});

function HomePage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold text-ink">Home</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Your home page will live here.
      </p>
    </div>
  );
}
