import { create } from "zustand";

// One download per app session: the intro and Settings each mount their own usePlamoModel and must not start a second writer.
let inflight: Promise<void> | null = null;

/** Lets the shell show background download progress no matter which screen started it. */
export const usePlamoDownloadStore = create<{ downloading: boolean; percent: number }>(() => ({ downloading: false, percent: 0 }));

export function currentPlamoDownload(): Promise<void> | null {
  return inflight;
}

export function downloadPlamoModelOnce(invoke: (cmd: "download_plamo_model") => Promise<unknown>): Promise<void> {
  if (!inflight) {
    usePlamoDownloadStore.setState({ downloading: true, percent: 0 });
    inflight = invoke("download_plamo_model")
      .then(() => undefined)
      .finally(() => {
        inflight = null;
        usePlamoDownloadStore.setState({ downloading: false });
      });
  }
  return inflight;
}

/** Onboarding test builds already have the model, so the real download ends at once; walk the progress over ~8 s instead. */
export function simulatePlamoDownload(): Promise<void> {
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      const percent = Math.min(100, usePlamoDownloadStore.getState().percent + 5);
      usePlamoDownloadStore.setState({ percent });
      if (percent === 100) {
        clearInterval(timer);
        resolve();
      }
    }, 400);
  });
}
