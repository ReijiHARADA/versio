import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { FilterIcon as Filter } from "@solar-icons/react/linear";
import { useTagColors } from "../../stores/tagColors";
import { useAppStore } from "../../stores/appStore";
import { applyTagColor } from "../../services/tagColorService";
import { LabelColorPicker } from "../ui/LabelColorPicker";
import { Presence, MotionDiv } from "../ui/Presence";
import motion from "../../styles/motion.module.css";
import styles from "./TagMenu.module.css";

const MENU_WIDTH = 220;
const MENU_HEIGHT = 110;

type TagMenuState = { tag: string; top: number; left: number } | null;

const useTagMenu = create<{ menu: TagMenuState; set: (menu: TagMenuState) => void }>((set) => ({
  menu: null,
  set: (menu) => set({ menu }),
}));

const close = () => useTagMenu.getState().set(null);

/** Right-click handler for a tag chip: opens the tag's color menu at the cursor. */
export function openTagMenu(event: React.MouseEvent, tag: string) {
  event.preventDefault();
  event.stopPropagation();
  const left = Math.min(Math.max(8, event.clientX), window.innerWidth - MENU_WIDTH - 8);
  let top = event.clientY + 4;
  if (top + MENU_HEIGHT > window.innerHeight - 8) top = Math.max(8, event.clientY - MENU_HEIGHT - 4);
  useTagMenu.getState().set({ tag, top, left });
}

/** One shared tag context menu (color + filter), mounted once in the app shell. */
export function TagMenu() {
  const menu = useTagMenu((state) => state.menu);
  const tagColors = useTagColors((state) => state.colors);
  const tagFilter = useAppStore((state) => state.libraryFilter.tag);
  const setLibraryFilter = useAppStore((state) => state.setLibraryFilter);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  return createPortal(
    <Presence>
      {menu ? (
        <MotionDiv
          key={menu.tag}
          ref={ref}
          className={`${styles.menu} ${motion.popover}`}
          role="menu"
          data-tag-menu=""
          style={{ top: menu.top, left: menu.left }}
        >
          <div className={styles.title}>#{menu.tag}</div>
          <div className={styles.colors}>
            <LabelColorPicker
              label={`タグ「${menu.tag}」の色`}
              value={tagColors[menu.tag.toLocaleLowerCase()]}
              onChange={(color) => void applyTagColor(menu.tag, color)}
            />
          </div>
          <div className={styles.separator} role="separator" />
          <button
            type="button"
            className={styles.item}
            role="menuitem"
            onClick={() => {
              setLibraryFilter({ tag: tagFilter === menu.tag ? null : menu.tag });
              close();
            }}
          >
            <Filter size={14} />
            {tagFilter === menu.tag ? "絞り込みを解除" : "このタグで絞り込む"}
          </button>
        </MotionDiv>
      ) : null}
    </Presence>,
    document.body,
  );
}
