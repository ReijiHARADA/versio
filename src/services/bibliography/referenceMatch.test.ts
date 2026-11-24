import { describe, expect, it } from "vitest";
import {
  guessReferenceTitle,
  parseCrossrefSearch,
  parseOpenAlexSearch,
  pickReferenceMatch,
  type ReferenceCandidate,
} from "./referenceMatch";
import { findCitedWork } from "./searchReference";

const cand = (over: Partial<ReferenceCandidate>): ReferenceCandidate => ({
  title: "Contrastive test-time adaptation",
  doi: "10.1109/cvpr52688.2022.00039",
  year: 2022,
  authors: ["Chen", "Wang"],
  source: "crossref",
  ...over,
});
const REF =
  "Dian Chen, Dequan Wang, Trevor Darrell, and Sayna Ebrahimi. Contrastive test-time adaptation. In Proceedings of the IEEE/CVF Conference on Computer Vision and Pattern Recognition, pages 295--305, 2022.";

describe("pickReferenceMatch", () => {
  it("accepts a hit whose title, year and first author agree", () => {
    expect(pickReferenceMatch(REF, [cand({})])?.candidate.doi).toBe("10.1109/cvpr52688.2022.00039");
  });

  it("rejects a different title, a far year or another first author", () => {
    expect(pickReferenceMatch(REF, [cand({ title: "Test-time training with self-supervision" })])).toBeNull();
    expect(pickReferenceMatch(REF, [cand({ year: 2015 })])).toBeNull();
    expect(pickReferenceMatch(REF, [cand({ authors: ["Zhang"] })])).toBeNull();
  });

  it("allows a one-year gap (preprint vs proceedings)", () => {
    expect(pickReferenceMatch(REF, [cand({ year: 2021 })])).not.toBeNull();
  });

  it("prefers the published version over a preprint DOI", () => {
    const ref = "Galati A, Dale R. Task goals constrain the alignment in eye-movements and speech. J Mem Lang 2025.";
    const title = "Task goals constrain the alignment in eye-movements and speech";
    const picked = pickReferenceMatch(ref, [
      cand({ title, doi: "10.31234/osf.io/6fjr9_v2", year: 2025, authors: ["Galati"] }),
      cand({ title, doi: "10.1016/j.jml.2025.104691", year: 2025, authors: ["Galati"], venue: "J Mem Lang" }),
    ]);
    expect(picked?.candidate.doi).toBe("10.1016/j.jml.2025.104691");
  });

  it("matches display names and accents", () => {
    const ref = "José Núñez. Über die Methode der kleinsten Quadrate im Allgemeinen. 2019.";
    const hit = cand({ title: "Uber die Methode der kleinsten Quadrate im Allgemeinen", year: 2019, authors: ["Jose Nunez"] });
    expect(pickReferenceMatch(ref, [hit])).not.toBeNull();
  });
});

describe("guessReferenceTitle", () => {
  it.each([
    [REF, "Contrastive test-time adaptation"],
    [
      "Hyojin Bahng, Ali Jahanian, and Phillip Isola. Visual prompting: Modifying pixel space to adapt pre-trained models. arXiv preprint, 2022.",
      "Visual prompting: Modifying pixel space to adapt pre-trained models",
    ],
    [
      "Roschewitz, M., Ribeiro, F.D.S., Glocker, B.: Robust image representations with counterfactual contrastive learning. Medical Image Analysis (2025)",
      "Robust image representations with counterfactual contrastive learning",
    ],
    ["[3] Smith J, Doe A (2019) Deep learning for cats and dogs. Nature 12:1-5", "Deep learning for cats and dogs"],
  ])("%s", (raw, title) => {
    expect(guessReferenceTitle(raw)).toBe(title);
  });

  it("gives up on a bare URL", () => {
    expect(guessReferenceTitle("[2] https://github.com/ggml-org/llama.cpp")).toBeNull();
  });
});

describe("parsers", () => {
  it("reads Crossref and OpenAlex search results", () => {
    const crossref = parseCrossrefSearch(
      JSON.stringify({ message: { items: [{ DOI: "10.1/x", title: ["T"], issued: { "date-parts": [[2020]] }, author: [{ family: "Li" }] }] } })
    );
    expect(crossref[0]).toMatchObject({ doi: "10.1/x", title: "T", year: 2020, authors: ["Li"] });
    const openalex = parseOpenAlexSearch(
      JSON.stringify({ results: [{ doi: "https://doi.org/10.48550/arxiv.2203.17274", title: "V", publication_year: 2022, authorships: [{ author: { display_name: "Hyojin Bahng" } }] }] })
    );
    expect(openalex[0]).toMatchObject({ doi: "10.48550/arxiv.2203.17274", authors: ["Hyojin Bahng"] });
  });
});

describe("findCitedWork", () => {
  it("falls back to an OpenAlex title search when Crossref has no match", async () => {
    const calls: string[] = [];
    const found = await findCitedWork(REF, async (source, query) => {
      calls.push(`${source}:${query}`);
      if (source === "crossref") return JSON.stringify({ message: { items: [] } });
      return JSON.stringify({
        results: [{ doi: "https://doi.org/10.48550/arxiv.2204.10377", title: "Contrastive Test-Time Adaptation", publication_year: 2022, authorships: [{ author: { display_name: "Dian Chen" } }] }],
      });
    });
    expect(calls[1]).toBe("openalex:Contrastive test-time adaptation");
    expect(found?.doi).toBe("10.48550/arxiv.2204.10377");
  });
});
