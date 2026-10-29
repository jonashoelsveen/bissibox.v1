export type SessionCopyMenu = {
  showCopy: boolean;
  copyLabel: string;
  showDuplicate: boolean;
  duplicateEnabled: boolean;
  showDelete: boolean;
  deleteEnabled: boolean;
  deleteLabel: string;
  rowCount: number;
};

/**
 * Right-click actions for one session, or for a shift-selected set.
 * Standard web-address sessions can be copied and duplicated. They are not
 * deletable. A selection that is only those sessions hides Delete.
 */
export function sessionCopyMenu(input: {
  count: number;
  subscriptionOnly: boolean;
  anyDeletable: boolean;
  singleCanDuplicate: boolean;
}): SessionCopyMenu {
  const bulk = input.count > 1;
  const showCopy = input.count > 0;
  const showDuplicate = !bulk && showCopy;
  const showDelete = showCopy && !input.subscriptionOnly;
  const duplicateEnabled = showDuplicate && input.singleCanDuplicate;
  const deleteEnabled = showDelete && input.anyDeletable;
  const rowCount = (showCopy ? 1 : 0) + (showDuplicate ? 1 : 0) + (showDelete ? 1 : 0);
  return {
    showCopy,
    copyLabel: bulk ? "Copy sessions" : "Copy session",
    showDuplicate,
    duplicateEnabled,
    showDelete,
    deleteEnabled,
    deleteLabel: bulk ? "Delete sessions" : "Delete session",
    rowCount,
  };
}
