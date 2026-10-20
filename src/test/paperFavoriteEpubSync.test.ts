import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/database", () => ({
  setPaperFavorite: vi.fn(async () => undefined),
  getSetting: vi.fn(async () => undefined),
  saveSetting: vi.fn(async () => undefined),
}));

vi.mock("../stores/libraryCache", () => ({
  useLibraryCache: {
    getState: () => ({
      updatePaper: vi.fn(),
    }),
  },
}));

vi.mock("../stores/toastStore", () => ({
  showToast: vi.fn(),
}));

vi.mock("../utils/serverReady", () => ({
  isTauriApp: vi.fn(() => true),
}));

vi.mock("../services/epubSync", async () => {
  const actual = await vi.importActual<typeof import("../services/epubSync")>(
    "../services/epubSync"
  );
  return {
    ...actual,
    getEpubSyncFolder: vi.fn(),
    pushPaperEpubToSyncFolder: vi.fn(),
  };
});

import { getSetting, saveSetting, setPaperFavorite } from "../services/database";
import {
  getEpubSyncFolder,
  markPaperEpubSynced,
  pushPaperEpubToSyncFolder,
} from "../services/epubSync";
import {
  presentEpubSyncFeedback,
  sendPaperEpubToSyncFolder,
} from "../services/paperEpubSync";
import { applyPaperFavorite } from "../services/paperFavorite";
import { useEpubSyncStore } from "../stores/epubSyncStore";
import { showToast } from "../stores/toastStore";
import { isTauriApp } from "../utils/serverReady";

describe("applyPaperFavorite", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("only toggles favorite and never pushes EPUB", async () => {
    await applyPaperFavorite("paper-1", true);

    expect(setPaperFavorite).toHaveBeenCalledWith("paper-1", true);
    expect(pushPaperEpubToSyncFolder).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: "お気に入りに追加しました" })
    );
  });
});

describe("sendPaperEpubToSyncFolder", () => {
  beforeEach(() => {
    useEpubSyncStore.setState({ byPaperId: {}, hydrated: false });
    vi.mocked(isTauriApp).mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns ok when a sync folder is configured", async () => {
    vi.mocked(getEpubSyncFolder).mockResolvedValue("/Users/me/iCloud/PaperReader");
    vi.mocked(pushPaperEpubToSyncFolder).mockResolvedValue({
      synced: true,
      path: "/Users/me/iCloud/PaperReader/paper.epub",
      fileName: "paper.epub",
    });

    await expect(sendPaperEpubToSyncFolder("paper-1")).resolves.toEqual({
      status: "ok",
      path: "/Users/me/iCloud/PaperReader/paper.epub",
      fileName: "paper.epub",
    });
    expect(pushPaperEpubToSyncFolder).toHaveBeenCalledWith("paper-1", {
      folderPath: "/Users/me/iCloud/PaperReader",
    });
  });

  it("returns needs_folder when none is set", async () => {
    vi.mocked(getEpubSyncFolder).mockResolvedValue(null);

    await expect(sendPaperEpubToSyncFolder("paper-1")).resolves.toEqual({
      status: "needs_folder",
    });
    expect(pushPaperEpubToSyncFolder).not.toHaveBeenCalled();
  });
});

describe("presentEpubSyncFeedback", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("offers a settings action when the folder is missing", () => {
    const onOpenSettings = vi.fn();
    presentEpubSyncFeedback({ status: "needs_folder" }, { onOpenSettings });
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "info",
        message: "先に同期先フォルダを設定してください",
        actionLabel: "設定を開く",
        onAction: onOpenSettings,
      })
    );
  });

  it("reports save vs update", () => {
    presentEpubSyncFeedback(
      { status: "ok", path: "/tmp/a.epub", fileName: "a.epub" },
      { alreadySaved: false }
    );
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: "同期先へ EPUB を保存しました" })
    );

    presentEpubSyncFeedback(
      { status: "ok", path: "/tmp/a.epub", fileName: "a.epub" },
      { alreadySaved: true }
    );
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: "同期先の EPUB を更新しました" })
    );
  });
});

describe("markPaperEpubSynced", () => {
  beforeEach(() => {
    useEpubSyncStore.setState({ byPaperId: {}, hydrated: false });
    vi.mocked(getSetting).mockResolvedValue({});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("persists saved state for the paper", async () => {
    await markPaperEpubSynced("paper-2", {
      fileName: "demo.epub",
      folderPath: "/sync",
    });
    expect(useEpubSyncStore.getState().byPaperId["paper-2"]).toMatchObject({
      fileName: "demo.epub",
      folderPath: "/sync",
    });
    expect(saveSetting).toHaveBeenCalledWith(
      "epubSyncByPaper",
      expect.objectContaining({
        "paper-2": expect.objectContaining({
          fileName: "demo.epub",
          folderPath: "/sync",
        }),
      })
    );
  });
});
