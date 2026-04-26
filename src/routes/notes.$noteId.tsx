import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/notes/$noteId")({
  component: NoteRedirect,
  head: () => ({ meta: [{ title: "Note · Raceline" }] }),
});

function NoteRedirect() {
  const { noteId } = useParams({ from: "/notes/$noteId" });
  const navigate = useNavigate();
  useEffect(() => {
    navigate({ to: "/media", search: { tab: "notes", open: noteId }, replace: true });
  }, [noteId, navigate]);
  return null;
}
