/**
 * Pixel mirrors of `--icon-size*` in `variables.css` for Lucide `size` props.
 * Prefer CSS `width`/`height: var(--icon-size)` on chrome icon buttons when
 * possible; use these when a component API requires a number.
 */
export const iconSize = {
  sm: 14,
  /** Default chrome / toolbar (matches AppSidebar). */
  md: 16,
  lg: 18,
  xl: 20,
} as const;

export type IconSizeToken = keyof typeof iconSize;
