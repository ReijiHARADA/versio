import { create } from "zustand";

// One download per app session: the intro and Settings each mount their own usePlamoModel and must not start a second writer.
let inflight: Promise<void> | null = null;

/** Lets the shell show background download progress no matter which screen started it. */
export const usePlamoDownloadStore = create<{ downloading: boolean }>(() => ({ downloading: false }));

export function currentPlamoDownload(): Promise<void> | null {
  return inflight;
}

export function downloadPlamoModelOnce(invoke: (cmd: "download_plamo_model") => Promise<unknown>): Promise<void> {
  if (!inflight) {
    usePlamoDownloadStore.setState({ downloading: true });
    inflight = invoke("download_plamo_model")
      .then(() => undefined)
      .finally(() => {
        inflight = null;
        usePlamoDownloadStore.setState({ downloading: false });
      });
  }
  return inflight;
}
