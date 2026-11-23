import { describe, expect, it, vi } from "vitest";
import { translateQueryTerm } from "../../services/search/queryTranslation";

function reply(content: string) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
}

const server = { baseUrl: "http://127.0.0.1:1", token: "t" };

function requestBody(fetchImpl: ReturnType<typeof vi.fn>) {
  const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
  return JSON.parse(String(init.body)) as { chat_template_kwargs: Record<string, string> };
}

describe("translateQueryTerm", () => {
  it("returns null without a running sidecar", async () => {
    const fetchImpl = vi.fn();
    expect(await translateQueryTerm("視線入力A", { getServer: async () => null, fetchImpl })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("translates Japanese to English and cleans the answer", async () => {
    const fetchImpl = vi.fn(async () => reply("「gaze input」。"));
    expect(await translateQueryTerm("視線入力B", { getServer: async () => server, fetchImpl })).toBe("gaze input");
    expect(requestBody(fetchImpl).chat_template_kwargs).toMatchObject({ source_lang: "ja", target_lang: "en" });
  });

  it("translates English to Japanese and caches the answer", async () => {
    const fetchImpl = vi.fn(async () => reply("触覚提示"));
    const deps = { getServer: async () => server, fetchImpl };
    expect(await translateQueryTerm("haptic display C", deps)).toBe("触覚提示");
    expect(await translateQueryTerm("haptic display C", deps)).toBe("触覚提示");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(requestBody(fetchImpl).chat_template_kwargs).toMatchObject({ source_lang: "en", target_lang: "ja" });
  });

  it("drops echoes and errors", async () => {
    const echo = { getServer: async () => server, fetchImpl: async () => reply("echo d") };
    expect(await translateQueryTerm("Echo D", echo)).toBeNull();
    const failing = { getServer: async () => server, fetchImpl: async () => new Response("", { status: 500 }) };
    expect(await translateQueryTerm("Fail E", failing)).toBeNull();
  });
});
