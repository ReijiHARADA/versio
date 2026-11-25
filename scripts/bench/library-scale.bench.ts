import { test } from "vitest";
import { runLibraryScaleBench } from "./library-scale";

test("library scale", async () => {
  const sizes = (process.env.SIZES ?? "100,1000").split(",").map(Number).filter((x) => x > 0);
  await runLibraryScaleBench(sizes);
}, 3_600_000);
