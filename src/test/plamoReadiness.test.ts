import { describe, expect, it } from "vitest";
import { describePlamoError } from "../services/translation/plamoReadiness";

describe("describePlamoError", () => {
  it("explains known sidecar error codes", () => {
    expect(describePlamoError("checksum_mismatch")).toBe("ダウンロードしたモデルが壊れていました。再試行してください。");
    expect(describePlamoError("download_failed")).toBe("ネットワークに接続できませんでした。接続を確認して再試行してください。");
    expect(describePlamoError("server_start_timeout")).toBe("翻訳エンジンを起動できませんでした。");
    expect(describePlamoError("server_exited")).toBe("翻訳エンジンを起動できませんでした。");
    expect(describePlamoError(new Error("model_not_downloaded"))).toBe("翻訳モデルがまだダウンロードされていません。");
  });
  it("keeps the raw reason for unknown errors", () => {
    expect(describePlamoError("spawn_failed: No such file")).toBe("翻訳モデルの準備に失敗しました（spawn_failed: No such file）");
  });
});
