import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import styles from "./SettingsSelect.module.css";

export type SettingsSelectOption<T extends string | number> = {
  value: T;
  label: string;
};

type SettingsSelectProps<T extends string | number> = {
  value: T;
  options: readonly SettingsSelectOption<T>[];
  onChange: (value: T) => void;
  id?: string;
  disabled?: boolean;
  "aria-label"?: string;
};

/**
 * Design-system select: current value stays in the trigger; other options
 * open as one continuous menu above/below with a hole aligned to the box.
 */
export function SettingsSelect<T extends string | number>({
  value,
  options,
  onChange,
  id,
  disabled = false,
  "aria-label": ariaLabel,
}: SettingsSelectProps<T>) {
  const autoId = useId();
  const listboxId = `${autoId}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  );
  const selected = options[selectedIndex] ?? options[0];

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const moveSelection = (delta: number) => {
    if (options.length === 0) return;
    const next = options[(selectedIndex + delta + options.length) % options.length];
    if (next) onChange(next.value);
  };

  return (
    <div
      ref={rootRef}
      className={`${styles.root} ${open ? styles.open : ""} ${disabled ? styles.disabled : ""}`}
      style={
        {
          "--select-selected-index": selectedIndex,
        } as CSSProperties
      }
    >
      {open && options.length > 1 ? (
        <div
          id={listboxId}
          className={styles.menu}
          role="listbox"
          aria-label={ariaLabel}
        >
          {options.map((option, index) =>
            index === selectedIndex ? (
              <div
                key={String(option.value)}
                className={styles.selectedSlot}
                role="option"
                aria-selected="true"
              />
            ) : (
              <button
                key={String(option.value)}
                type="button"
                role="option"
                aria-selected={false}
                className={styles.option}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            )
          )}
        </div>
      ) : null}

      <button
        id={id}
        type="button"
        className={styles.trigger}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        onClick={() => {
          if (!disabled) setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (!open) setOpen(true);
            else moveSelection(1);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) setOpen(true);
            else moveSelection(-1);
          } else if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen((current) => !current);
          }
        }}
      >
        <span className={styles.value}>{selected?.label ?? ""}</span>
      </button>
    </div>
  );
}
