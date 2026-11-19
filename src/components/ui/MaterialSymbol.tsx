import type { ComponentPropsWithoutRef, CSSProperties } from "react";

type MaterialSymbolProps = Omit<ComponentPropsWithoutRef<"span">, "children" | "color"> & {
  size?: number | string;
  color?: string;
  fill?: string;
  strokeWidth?: number;
};

function symbol(name: string) {
  return function MaterialSymbol({
    size = 24,
    color,
    fill,
    strokeWidth: _strokeWidth,
    className,
    style,
    "aria-hidden": ariaHidden,
    ...props
  }: MaterialSymbolProps) {
    const symbolStyle: CSSProperties = {
      fontSize: size,
      fontWeight: 600,
      color,
      fontVariationSettings: fill && fill !== "none" ? "'FILL' 1" : "'FILL' 0",
      ...style,
    };

    return (
      <span
        {...props}
        aria-hidden={ariaHidden ?? true}
        className={`material-symbols-sharp${className ? ` ${className}` : ""}`}
        style={symbolStyle}
      >
        {name}
      </span>
    );
  };
}

export const AlertCircle = symbol("error");
export const AlertTriangle = symbol("warning");
export const ArrowLeft = symbol("arrow_back");
export const BookMarked = symbol("bookmark");
export const BookOpen = symbol("menu_book");
export const Check = symbol("check");
export const CheckCircle = symbol("check_circle");
export const ChevronDown = symbol("keyboard_arrow_down");
export const ChevronRight = symbol("chevron_right");
export const ChevronUp = symbol("keyboard_arrow_up");
export const Clock = symbol("schedule");
export const ExternalLink = symbol("open_in_new");
export const Eye = symbol("visibility");
export const EyeOff = symbol("visibility_off");
export const FilePlus2 = symbol("note_add");
export const FileText = symbol("description");
export const FileUp = symbol("upload_file");
export const Folder = symbol("folder");
export const FolderOpen = symbol("folder_open");
export const FolderPlus = symbol("create_new_folder");
export const FolderX = symbol("folder_off");
export const Inbox = symbol("inbox");
export const Library = symbol("local_library");
export const Loader2 = symbol("progress_activity");
export const Maximize2 = symbol("open_in_full");
export const Monitor = symbol("desktop_windows");
export const Moon = symbol("dark_mode");
export const MoreHorizontal = symbol("more_horiz");
export const PanelLeft = symbol("left_panel_open");
export const PanelLeftClose = symbol("left_panel_close");
export const PanelLeftOpen = symbol("left_panel_open");
export const Pause = symbol("pause");
export const Pencil = symbol("edit");
export const Play = symbol("play_arrow");
export const Plus = symbol("add");
export const RefreshCw = symbol("refresh");
export const RotateCcw = symbol("undo");
export const Search = symbol("search");
export const Settings = symbol("settings");
export const Settings2 = symbol("tune");
export const Smartphone = symbol("smartphone");
export const Star = symbol("star");
export const StickyNote = symbol("sticky_note_2");
export const Sun = symbol("light_mode");
export const Trash2 = symbol("delete");
export const Upload = symbol("upload");
export const UserMinus = symbol("person_remove");
export const X = symbol("close");
