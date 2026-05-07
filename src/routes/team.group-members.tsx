import { createFileRoute } from "@tanstack/react-router";
import { GroupMembersPage } from "@/components/team/GroupMembersPage";

export const Route = createFileRoute("/team/group-members")({
  component: GroupMembersPage,
  head: () => ({ meta: [{ title: "Group Members · Raceline" }] }),
});
