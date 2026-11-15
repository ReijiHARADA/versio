import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Filming-only input. The Reader fixture in src/services/presentationDemo.ts
// quotes this paper; the figures below are cropped or extracted from the
// original PDF locally and stay gitignored.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "tmp/versio-demo/Versio-Demo.pdf");
const source = resolve(root, "test-data/real-papers/design-for-wearability.pdf");
const assets = resolve(root, "public/presentation-demo-assets");
const extractPrefix = resolve(assets, ".design-for-wearability-extract");

if (!existsSync(source)) {
  throw new Error(
    `Design for Wearability source PDF is unavailable: ${source}\nRun npm run fetch:real-papers first.`
  );
}

mkdirSync(dirname(output), { recursive: true });
mkdirSync(assets, { recursive: true });
copyFileSync(source, output);

// Remove assets from earlier fixture versions and stale extractions.
for (const name of readdirSync(assets)) {
  if (name.endsWith(".png")) rmSync(resolve(assets, name), { force: true });
}

/**
 * Vector line-art figures: crop the page render at 300 dpi. The Reader scales
 * figures to the column width, so `padWidth` adds white side margins to keep
 * tall line art at a natural reading size (macOS `sips`).
 */
const crops = [
  { name: "dfw-guidelines-box", page: 2, x: 225, y: 880, w: 1010, h: 1320, padWidth: 2050 },
  { name: "dfw-fig1-placement", page: 2, x: 1340, y: 760, w: 1180, h: 830, padWidth: 1900 },
  { name: "dfw-fig2-form-language", page: 2, x: 1340, y: 2690, w: 980, h: 300, padWidth: 1400 },
  { name: "dfw-fig4-proxemics", page: 3, x: 1560, y: 470, w: 540, h: 610, padWidth: 1500 },
];
for (const crop of crops) {
  execFileSync(
    "pdftoppm",
    [
      "-r", "300", "-png", "-singlefile",
      "-f", String(crop.page), "-l", String(crop.page),
      "-x", String(crop.x), "-y", String(crop.y), "-W", String(crop.w), "-H", String(crop.h),
      source, resolve(assets, crop.name),
    ],
    { stdio: ["ignore", "ignore", "ignore"] }
  );
  execFileSync(
    "sips",
    ["--padToHeightWidth", String(crop.h), String(crop.padWidth), "--padColor", "FFFFFF", resolve(assets, `${crop.name}.png`)],
    { stdio: ["ignore", "ignore", "ignore"] }
  );
}

/** Photographic figures: use the embedded raster images as-is. */
execFileSync("pdfimages", ["-png", source, extractPrefix], { stdio: ["ignore", "ignore", "ignore"] });
renameSync(`${extractPrefix}-006.png`, resolve(assets, "dfw-fig7-navigator.png"));
renameSync(`${extractPrefix}-007.png`, resolve(assets, "dfw-fig8-arc-tool.png"));
for (const name of readdirSync(assets)) {
  if (name.startsWith(".design-for-wearability-extract")) rmSync(resolve(assets, name), { force: true });
}
console.log(output);
