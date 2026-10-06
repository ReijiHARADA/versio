import { create } from "zustand";

export type ToastKind = "success" | "error" | "info";

export type AppToast = {
  kind: ToastKind;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Runs when the toast times out or is replaced — not when cleared via the action. */
  onExpire?: () => void;
};

type ToastState = {
  toast: AppToast | null;
  showToast: (toast: AppToast) => void;
  clearToast: () => void;
};

let toastTimer: ReturnType<typeof setTimeout> | undefined;
let pendingExpire: (() => void) | undefined;

function commitPendingExpire() {
  const commit = pendingExpire;
  pendingExpire = undefined;
  commit?.();
}

export const useToastStore = create<ToastState>((set) => ({
  toast: null,
  showToast: (toast) => {
    if (toastTimer) clearTimeout(toastTimer);
    // Replacing a toast commits any deferred work from the previous one.
    commitPendingExpire();
    pendingExpire = toast.onExpire;
    set({ toast });
    toastTimer = setTimeout(() => {
      set({ toast: null });
      toastTimer = undefined;
      commitPendingExpire();
    }, toast.onAction ? 6000 : 3200);
  },
  clearToast: () => {
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = undefined;
    // Action / manual dismiss cancels deferred expire (undo path).
    pendingExpire = undefined;
    set({ toast: null });
  },
}));

export function showToast(toast: AppToast): void {
  useToastStore.getState().showToast(toast);
}
