import { describe, expect, it } from "vitest";
import { acquireImportHash } from "../../services/import/session";

describe("acquireImportHash", () => {
  it("serialises imports of the same PDF hash", async () => {
    const order: string[] = [];
    const releaseA = await acquireImportHash("h1");
    order.push("A acquired");
    const b = acquireImportHash("h1").then((release) => {
      order.push("B acquired");
      release();
    });
    await Promise.resolve();
    order.push("A releasing");
    releaseA();
    await b;
    expect(order).toEqual(["A acquired", "A releasing", "B acquired"]);
  });

  it("does not block different hashes", async () => {
    const releaseA = await acquireImportHash("h2");
    const releaseB = await acquireImportHash("h3");
    releaseA();
    releaseB();
  });

  it("lets three concurrent imports of one hash run one at a time", async () => {
    let active = 0;
    let maxActive = 0;
    const run = async () => {
      const release = await acquireImportHash("h4");
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      release();
    };
    await Promise.all([run(), run(), run()]);
    expect(maxActive).toBe(1);
  });

  it("release is idempotent", async () => {
    const release = await acquireImportHash("h5");
    release();
    release();
    const again = await acquireImportHash("h5");
    again();
  });
});
