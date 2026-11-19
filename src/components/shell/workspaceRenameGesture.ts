export const WORKSPACE_RENAME_DOUBLE_CLICK_MS = 250;

export function isWorkspaceRenameDoubleClick(
  previous: { nodeId: string; at: number } | null,
  nodeId: string,
  at: number
) {
  return previous?.nodeId === nodeId && at - previous.at <= WORKSPACE_RENAME_DOUBLE_CLICK_MS;
}
