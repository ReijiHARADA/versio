import { describe, expect, it, vi } from "vitest";
import { PLAMO_MODEL, PLAMO_MODEL_VERSION, PlamoEngine } from "../services/translation/plamoEngine";
import { TranslationQualityError } from "../services/translation/retryPolicy";

const SRC = "The proposed model improves robustness across all evaluated benchmark datasets.";
const JA = "提案モデルは、評価したすべてのベンチマークデータセットで頑健性を向上させる。";

const reply = (content: string, status = 200) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 20, completion_tokens: 30 } }), { status });

function setup(replies: Response[]) {
  const fetchImpl = vi.fn(async () => replies.shift() ?? reply(JA));
  let n = 0;
  const getServer = vi.fn(async () => ({ baseUrl: "http://127.0.0.1:8766", token: `tok${++n}` }));
  return { engine: new PlamoEngine({ fetchImpl: fetchImpl as unknown as typeof fetch, getServer }), fetchImpl, getServer };
}

describe("PlamoEngine", () => {
  it("sends plamo request body", async () => {
    const { engine, fetchImpl } = setup([reply(JA)]);
    await engine.translate(SRC, "en", "ja");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:8766/v1/chat/completions");
    const body = JSON.parse(init.body as string);
    expect(body.messages).toEqual([{ role: "user", content: SRC }]);
    expect(body.temperature).toBe(0);
    expect(body.max_tokens).toBe(4096);
    expect(body.chat_template_kwargs).toEqual({ source_lang: "en", target_lang: "ja", form: "plain" });
    expect(body.stop).toEqual(["<|plamo:tag|>", "<|plamo:bos|>"]);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok1");
  });

  it("retries once on 401 with refreshed server info", async () => {
    const { engine, fetchImpl, getServer } = setup([new Response("", { status: 401 }), reply(JA)]);
    const r = await engine.translate(SRC, "en", "ja");
    expect(r.text).toBe(JA);
    expect(getServer).toHaveBeenCalledTimes(2);
    expect((fetchImpl.mock.calls[1] as unknown as [string, RequestInit])[1].headers).toMatchObject({ Authorization: "Bearer tok2" });
  });

  it("re-requests once when check fails", async () => {
    const { engine, fetchImpl } = setup([reply(SRC), reply(JA)]);
    expect((await engine.translate(SRC, "en", "ja")).text).toBe(JA);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not loop on persistent echo", async () => {
    const { engine, fetchImpl } = setup([reply(SRC), reply(SRC), reply(SRC)]);
    await expect(engine.translate(SRC, "en", "ja")).rejects.toBeInstanceOf(TranslationQualityError);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("result identity", async () => {
    const { engine } = setup([reply(JA)]);
    const r = await engine.translate(SRC, "en", "ja");
    expect(engine.name).toBe("plamo");
    expect(r.model).toBe(PLAMO_MODEL);
    expect(r.modelVersion).toBe(PLAMO_MODEL_VERSION);
    expect(r.model).toBe("plamo-3-translate-2b");
    expect(r.modelVersion).toBe("q4_k_m-1ffd9073-plain");
    expect(r.inputTokens).toBe(20);
    expect(r.outputTokens).toBe(30);
  });

  it("passes only glossary terms present in the text, using the surface form", async () => {
    const { engine, fetchImpl } = setup([reply(JA)]);
    engine.setGlossary([
      { term: "neuroimaging", translation: "ニューロイメージング" },
      { term: "RR", translation: "呼吸数" },
      { term: "unused term", translation: "未使用" },
      { term: "bad", translation: "" },
    ]);
    await engine.translate("Power-law signatures in neuroim-aging and RR values are bad.", "en", "ja");
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.chat_template_kwargs.glossary).toEqual([
      { source: "neuroim-aging", target: "ニューロイメージング" },
      { source: "RR", target: "呼吸数" },
    ]);
  });

  it("omits glossary when no term matches", async () => {
    const { engine, fetchImpl } = setup([reply(JA)]);
    engine.setGlossary([{ term: "transformer", translation: "トランスフォーマー" }]);
    await engine.translate(SRC, "en", "ja");
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.chat_template_kwargs).not.toHaveProperty("glossary");
  });
});
