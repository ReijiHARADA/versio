// While a pointer drag (tab, paper card, workspace node, divider) is in progress, the pointer
// sweeping over the Reader must not select body text: that selection means nothing and the memo
// menu never appears for it (its mouseup lands on the drag source, not the Reader). Call this once
// the drag passes its threshold; the returned function releases it. Nested drags share one lock.
let holders = 0;

export function suppressTextSelection(): () => void {
  window.getSelection()?.removeAllRanges();
  if (holders++ === 0) document.documentElement.classList.add("drag-no-select");
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--holders === 0) document.documentElement.classList.remove("drag-no-select");
  };
}
