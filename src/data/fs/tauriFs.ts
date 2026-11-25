import type { FileSystem } from "./types";

/** `read_app_file` reports a missing file with this error (see `paper_fs.rs`). */
const NOT_FOUND = "ENOENT";

/**
 * App-data filesystem via Tauri commands.
 * Paths are relative to the app data directory.
 */
export function createTauriFileSystem(): FileSystem {
  async function invoke<T>(
    cmd: string,
    args: Record<string, unknown> | Uint8Array,
    options?: { headers: Record<string, string> }
  ): Promise<T> {
    const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
    return tauriInvoke<T>(cmd, args, options);
  }

  return {
    // Bytes cross the IPC as raw bodies. A JSON number array cost 2.6 GB of
    // memory for a 50 MB library.sqlite (docs/research/library-scale-bench-2026-11.md).
    async readBytes(path) {
      try {
        return new Uint8Array(await invoke<ArrayBuffer>("read_app_file", { relativePath: path }));
      } catch (error) {
        if (error === NOT_FOUND) return null;
        throw error;
      }
    },
    async writeBytes(path, data) {
      await invoke("write_app_file", data, { headers: { "x-versio-path": encodeURIComponent(path) } });
    },
    async readText(path) {
      const bytes = await this.readBytes(path);
      return bytes ? new TextDecoder().decode(bytes) : null;
    },
    async writeText(path, text) {
      await this.writeBytes(path, new TextEncoder().encode(text));
    },
    async exists(path) {
      return invoke<boolean>("app_file_exists", { relativePath: path });
    },
    async remove(path) {
      await invoke("remove_app_file", { relativePath: path });
    },
    async rename(from, to) {
      await invoke("rename_app_file", { from, to });
    },
    async list(prefix) {
      return invoke<string[]>("list_app_files", { prefix });
    },
  };
}
