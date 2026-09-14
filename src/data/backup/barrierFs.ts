import type { FileSystem } from "../fs/types";
import {
  bumpStorageGeneration,
  isLibraryMutablePath,
  waitIfBackupBarrier,
} from "./snapshotBarrier";

/** Wrap an FS so library mutations respect the backup write barrier. */
export function wrapFileSystemWithBackupBarrier(base: FileSystem): FileSystem {
  const guardWrite = async (path: string) => {
    if (isLibraryMutablePath(path)) {
      await waitIfBackupBarrier();
      bumpStorageGeneration();
    }
  };

  return {
    readBytes: (path) => base.readBytes(path),
    async writeBytes(path, data) {
      await guardWrite(path);
      return base.writeBytes(path, data);
    },
    readText: (path) => base.readText(path),
    async writeText(path, text) {
      await guardWrite(path);
      return base.writeText(path, text);
    },
    exists: (path) => base.exists(path),
    async remove(path) {
      await guardWrite(path);
      return base.remove(path);
    },
    async rename(from, to) {
      if (isLibraryMutablePath(from) || isLibraryMutablePath(to)) {
        await waitIfBackupBarrier();
        bumpStorageGeneration();
      }
      return base.rename(from, to);
    },
    list: (prefix) => base.list(prefix),
  };
}
