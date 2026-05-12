import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  component: IndexRedirect,
  head: () => ({
    meta: [
      { title: "Raceline" },
      {
        name: "description",
        content:
          "Raceline — your calm hub for training, racing and team coordination.",
      },
    ],
  }),
});

function IndexRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" search={{ redirect: "/calendar" }} />;
  return <Navigate to="/calendar" />;
}
