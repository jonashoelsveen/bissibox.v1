/** A feed is visible only to the calendar owner, and only while it is not deleted. */
export function feedVisibleTo(
  actorId: string,
  ownerId: string,
  deletedAt: string | null | undefined,
): boolean {
  return actorId.length > 0 && actorId === ownerId && !deletedAt;
}
