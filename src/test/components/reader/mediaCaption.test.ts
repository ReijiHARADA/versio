import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Figure } from "../../../components/reader/Figure";
import { Table } from "../../../components/reader/Table";
import type { FigureMetadata, PaperBlock, TableMetadata } from "../../../types/paper";

// Characterization: the caption markup of figures and tables must stay stable.
const block = { id: "b1", paperId: "p1", original: "a | b" } as unknown as PaperBlock;

const captions = {
  translated: { captionOriginal: "Figure 1: Original caption", captionTranslated: "図1: 翻訳キャプション" },
  originalOnly: { captionOriginal: "Figure 2: Only original", captionTranslated: null },
};

describe("figure and table caption markup", () => {
  for (const [name, caption] of Object.entries(captions)) {
    it(`figure (${name})`, () => {
      const metadata = { figureNumber: "Figure 1", ...caption } as unknown as FigureMetadata;
      expect(renderToStaticMarkup(createElement(Figure, { block, metadata }))).toMatchSnapshot();
    });
    it(`table (${name})`, () => {
      const metadata = { tableNumber: "Table 1", ...caption } as unknown as TableMetadata;
      expect(renderToStaticMarkup(createElement(Table, { block, metadata }))).toMatchSnapshot();
    });
  }
});
