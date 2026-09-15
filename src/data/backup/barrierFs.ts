import type { FileSystem } from "../fs/types";
import { isLibraryMutablePath, withLibraryWriteLease } from "./snapshotBarrier";

/** Wrap an FS so library mutations respect the backup write barrier + drain. */
export function wrapFileSystemWithBackupBarrier(base: FileSystem): FileSystem {
  const guardedWrite = async <T>(path: string, run: () => Promise<T>): Promise<T> => {
    if (!isLibraryMutablePath(path)) {
      return run();
    }
    return withLibraryWriteLease(run);
  };

  return {
    readBytes: (path) => base.readBytes(path),
    async writeBytes(path, data) {
      return guardedWrite(path, () => base.writeBytes(path, data));
    },
    readText: (path) => base.readText(path),
    async writeText(path, text) {
      return guardedWrite(path, () => base.writeText(path, text));
    },
    exists: (path) => base.exists(path),
    async remove(path) {
      return guardedWrite(path, () => base.remove(path));
    },
    async rename(from, to) {
      if (!isLibraryMutablePath(from) && !isLibraryMutablePath(to)) {
        return base.rename(from, to);
      }
      return withLibraryWriteLease(() => base.rename(from, to));
    },
    list: (prefix) => base.list(prefix),
  };
}
