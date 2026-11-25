/** Opens the sidebar tree's folder menu (the "…" / right-click menu) from elsewhere, e.g. a folder card in item view. */
const EVENT = "versio:open-workspace-menu";

type Detail = { nodeId: string; x: number; y: number };

export function openWorkspaceMenu(nodeId: string, x: number, y: number) {
  window.dispatchEvent(new CustomEvent<Detail>(EVENT, { detail: { nodeId, x, y } }));
}

export function onOpenWorkspaceMenu(handler: (detail: Detail) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<Detail>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
