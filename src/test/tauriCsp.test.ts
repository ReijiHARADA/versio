import { describe, expect, it } from "vitest";
import conf from "../../src-tauri/tauri.conf.json";

describe("production CSP", () => {
  it("lets the WebView reach the PLaMo sidecar on any loopback port", () => {
    const csp = (conf as { app: { security: { csp: Record<string, string> } } }).app.security.csp;
    // The sidecar prefers 8766 but falls back to a free port when it is taken.
    expect(csp["connect-src"].split(/\s+/)).toContain("http://127.0.0.1:*");
  });
});
