import { beforeEach, describe, expect, it } from "vitest";
import { wrapFileSystemWithBackupBarrier } from "../../data/backup/barrierFs";
import {
  acquireLibraryWrite,
  getActiveLibraryWriters,
  isBackupBarrierActive,
  resetBackupBarrierForTests,
  withBackupWriteBarrier,
} from "../../data/backup/snapshotBarrier";
import { createMemoryFileSystem } from "../../data/fs/memoryFs";
import { openSqlite } from "../../data/sqlite/client";

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("backup barrier active-writer drain", () => {
  beforeEach(() => {
    resetBackupBarrierForTests();
  });

  it("waits for admitted in-flight writer before snapshot work runs", async () => {
    const writerEntered = deferred();
    const allowWriterFinish = deferred();
    let snapshotStarted = false;

    const writer = (async () => {
      const release = await acquireLibraryWrite();
      try {
        writerEntered.resolve();
        await allowWriterFinish.promise;
      } finally {
        release();
      }
    })();

    await writerEntered.promise;
    expect(getActiveLibraryWriters()).toBe(1);

    const backup = withBackupWriteBarrier(async () => {
      snapshotStarted = true;
      expect(getActiveLibraryWriters()).toBe(0);
      return "snap";
    });

    await Promise.resolve();
    expect(snapshotStarted).toBe(false);
    expect(isBackupBarrierActive()).toBe(true);

    allowWriterFinish.resolve();
    await expect(backup).resolves.toBe("snap");
    await writer;
    expect(getActiveLibraryWriters()).toBe(0);
    expect(isBackupBarrierActive()).toBe(false);
  });

  it("blocks new writers until snapshot barrier releases", async () => {
    const snapshotGate = deferred();
    let writerProgressed = false;

    const backup = withBackupWriteBarrier(async () => {
      await snapshotGate.promise;
      return "ok";
    });

    await Promise.resolve();
    expect(isBackupBarrierActive()).toBe(true);

    const writer = (async () => {
      const release = await acquireLibraryWrite();
      try {
        writerProgressed = true;
      } finally {
        release();
      }
    })();

    await Promise.resolve();
    expect(writerProgressed).toBe(false);

    snapshotGate.resolve();
    await backup;
    await writer;
    expect(writerProgressed).toBe(true);
  });

  it("releases active count when writer throws so barrier does not deadlock", async () => {
    const writerEntered = deferred();

    const writer = (async () => {
      const release = await acquireLibraryWrite();
      try {
        writerEntered.resolve();
        throw new Error("writer boom");
      } finally {
        release();
      }
    })();

    await writerEntered.promise;
    await expect(writer).rejects.toThrow(/writer boom/);
    expect(getActiveLibraryWriters()).toBe(0);

    await expect(
      withBackupWriteBarrier(async () => {
        expect(getActiveLibraryWriters()).toBe(0);
        return "drained";
      })
    ).resolves.toBe("drained");
  });

  it("drains multiple admitted writers before snapshot", async () => {
    const entered = [deferred(), deferred(), deferred()];
    const allow = deferred();

    const writers = entered.map((gate) =>
      (async () => {
        const release = await acquireLibraryWrite();
        try {
          gate.resolve();
          await allow.promise;
        } finally {
          release();
        }
      })()
    );

    await Promise.all(entered.map((g) => g.promise));
    expect(getActiveLibraryWriters()).toBe(3);

    let sawZero = false;
    const backup = withBackupWriteBarrier(async () => {
      sawZero = getActiveLibraryWriters() === 0;
      return "multi";
    });

    await Promise.resolve();
    expect(sawZero).toBe(false);

    allow.resolve();
    await expect(backup).resolves.toBe("multi");
    await Promise.all(writers);
    expect(sawZero).toBe(true);
    expect(getActiveLibraryWriters()).toBe(0);
  });

  it("FS wrapper: in-flight writeBytes completes before backup snapshot copies", async () => {
    const raw = createMemoryFileSystem();
    const db = await openSqlite(raw);
    await db.persist();
    await db.close();

    const writeEntered = deferred();
    const allowWriteBody = deferred();
    const slowRaw = {
      readBytes: (path: string) => raw.readBytes(path),
      readText: (path: string) => raw.readText(path),
      exists: (path: string) => raw.exists(path),
      remove: (path: string) => raw.remove(path),
      rename: (from: string, to: string) => raw.rename(from, to),
      list: (prefix: string) => raw.list(prefix),
      async writeBytes(path: string, data: Uint8Array) {
        if (path === "papers/in-flight/paper.json") {
          writeEntered.resolve();
          await allowWriteBody.promise;
        }
        return raw.writeBytes(path, data);
      },
      async writeText(path: string, text: string) {
        return this.writeBytes(path, new TextEncoder().encode(text));
      },
    };
    const fs = wrapFileSystemWithBackupBarrier(slowRaw);

    const writer = fs.writeText(
      "papers/in-flight/paper.json",
      JSON.stringify({ paperId: "in-flight" })
    );
    await writeEntered.promise;

    let snapshotSawFile = false;
    const backup = withBackupWriteBarrier(async () => {
      snapshotSawFile = await raw.exists("papers/in-flight/paper.json");
      return snapshotSawFile;
    });

    await Promise.resolve();
    expect(isBackupBarrierActive()).toBe(true);

    allowWriteBody.resolve();
    await writer;
    await expect(backup).resolves.toBe(true);
    expect(snapshotSawFile).toBe(true);
    expect(await raw.exists("papers/in-flight/paper.json")).toBe(true);
  });

  it("writers blocked during barrier resume afterward on live data", async () => {
    const raw = createMemoryFileSystem();
    const db = await openSqlite(raw);
    await db.persist();
    await db.close();
    const fs = wrapFileSystemWithBackupBarrier(raw);

    await fs.writeText("papers/early/paper.json", JSON.stringify({ paperId: "early" }));

    const releaseBarrierWork = deferred();
    let lateDone = false;
    const lateFinished = deferred();

    const barrier = withBackupWriteBarrier(async () => {
      void fs.writeText("papers/late/paper.json", JSON.stringify({ paperId: "late" })).then(() => {
        lateDone = true;
        lateFinished.resolve();
      });
      await Promise.resolve();
      expect(lateDone).toBe(false);
      expect(await raw.exists("papers/late/paper.json")).toBe(false);
      await releaseBarrierWork.promise;
      expect(lateDone).toBe(false);
    });

    await Promise.resolve();
    expect(isBackupBarrierActive()).toBe(true);
    releaseBarrierWork.resolve();
    await barrier;
    expect(isBackupBarrierActive()).toBe(false);

    await lateFinished.promise;
    expect(lateDone).toBe(true);
    expect(await raw.exists("papers/late/paper.json")).toBe(true);
    expect(await raw.exists("papers/early/paper.json")).toBe(true);
  });
});
