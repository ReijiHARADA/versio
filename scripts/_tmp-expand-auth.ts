// Probe expandAuthorLine via extractFromPages internals by reimplementing
// the marker split the same way, then call through a tiny import hack.
import { createRequire } from "node:module";

// Use dynamic eval of the pattern from toPaper by extracting via vitest-like import
// of private isn't available — mirror the critical path.
function probe(text: string) {
  const markedSource = text.replace(/\*/g, "∗"); // approximate
  console.log("input", text);
  const markerParts = text
    .split(/(?<=[*♠♣♡♢∗†‡§])\s*/u)
    .map((part) =>
      part
        .replace(/[♠♣♡♢∗†‡§*]/gu, "")
        .replace(/\d+/g, "")
        .replace(/^\s*and\s+/i, "")
        .replace(/^[,;·\s]+/, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((part) => part && /\p{L}/u.test(part));
  console.log("markerParts", markerParts);
}

probe("Muhamad Faez Faisal Sezali1,2, Mohd Nazri Shafei1,* , Afiq Izzudin A. Rahim1,3,*");
probe(
  "*Corresponding authors: Mohd Nazri Shafei, (drnazri@usm.my) and Afiq Izzudin A. Rahim, (drafiqrahim@usm.my)",
);
