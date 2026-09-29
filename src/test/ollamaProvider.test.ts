import { afterEach, describe, expect, it, vi } from "vitest";
import { OllamaProvider } from "../services/llm/ollamaProvider";

describe("OllamaProvider request deadlines", () => {
  afterEach(() => vi.restoreAllMocks());

  it("aborts a completion when the optional timeout expires", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }) as Promise<Response>,
    );

    const provider = new OllamaProvider("http://127.0.0.1:11434", "qwen3:14b");
    await expect(provider.complete("Translate this.", undefined, { timeoutMs: 5 }))
      .rejects.toThrow("Ollama request timed out after 5ms");
  });

  it("does not install a deadline when timeoutMs is absent", async () => {
    const response = new Response(JSON.stringify({ message: { content: "訳" } }), { status: 200 });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
    const provider = new OllamaProvider("http://127.0.0.1:11434", "gemma2:9b");
    await provider.complete("Translate this.");
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeUndefined();
  });

  it("forwards an explicit reasoning toggle without changing the default payload", async () => {
    const response = new Response(JSON.stringify({ message: { content: "訳" } }), { status: 200 });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
    const provider = new OllamaProvider("http://127.0.0.1:11434", "qwen3:14b");
    await provider.complete("Translate this.", undefined, { think: false });
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.think).toBe(false);
  });
});
