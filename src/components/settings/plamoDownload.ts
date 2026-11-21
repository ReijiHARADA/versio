// One download per app session: the intro and Settings each mount their own usePlamoModel and must not start a second writer.
let inflight: Promise<void> | null = null;

export function currentPlamoDownload(): Promise<void> | null {
  return inflight;
}

export function downloadPlamoModelOnce(invoke: (cmd: "download_plamo_model") => Promise<unknown>): Promise<void> {
  inflight ??= invoke("download_plamo_model")
    .then(() => undefined)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
