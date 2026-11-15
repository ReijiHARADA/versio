import type { CanonicalDocument } from "../../canonical/types";
import type { FrontMatterState } from "./authorRecovery";

type BodyBylineRecoveryHelpers = {
  expandAuthorLine: (text: string) => string[];
  isNonAuthorMastheadLine: (text: string) => boolean;
  looksLikeFrontiersReviewerCredit: (text: string) => boolean;
};

export function recoverBodyBylines(
  state: FrontMatterState,
  canonical: CanonicalDocument,
  helpers: BodyBylineRecoveryHelpers,
): void {
  const { expandAuthorLine, isNonAuthorMastheadLine, looksLikeFrontiersReviewerCredit } = helpers;
    const pageOneBylineTexts = canonical.nodes
      .filter((node) => node.pageStart === 1 && node.text)
      .map((node) => ({
        text: (node.text ?? "").replace(/\s+/g, " ").trim(),
        x: node.boundingBoxes[0]?.x ?? 0,
      }));
    const gluedCamelByline = pageOneBylineTexts
      .map((row) => row.text)
      .find((text) => {
        if (text.length < 12 || text.length > 90) return false;
        if (!/\band\b/i.test(text)) return false;
        if ((text.match(/[a-zà-öø-ÿ][A-ZÀ-Ö]/gu) ?? []).length < 2) return false;
        return /^[A-ZÀ-ÖØ-Ý][\p{L}'’.]+(?:\s+and\s+[A-ZÀ-ÖØ-Ý][\p{L}'’.]+)+\*?$/u.test(
          text,
        );
      });
    // Frontiers star-lead byline with one glued SurnameGiven
    // (`*, Jennifer S. Stevenson Xia Wang and Jiayi Wang`).
    // Require a real leading `*` so ordinary `Name and Name` author rows are
    // not force-promoted over a longer numbered byline.
    const starLeadByline = pageOneBylineTexts
      .map((row) => row.text)
      .filter((text) => /^\*+,?\s+[A-ZÀ-ÖØ-Ý]/u.test(text))
      .map((text) => text.replace(/^\*+,?\s*/, "").trim())
      .find((text) => {
        if (text.length < 20 || text.length > 140) return false;
        if (!/\band\b/i.test(text)) return false;
        if (!/^[A-ZÀ-ÖØ-Ý]/.test(text)) return false;
        if (looksLikeFrontiersReviewerCredit(text)) return false;
        if (
          /\b(?:university|institute|department|faculty|school of|college of|laboratory|received|keywords?)\b/i.test(
            text,
          )
        ) {
          return false;
        }
        // `Jennifer S. Stevenson Xia Wang` collapses to one greedy personish
        // match; require only two personish segments plus `and`, or one glued
        // CamelCase junction.
        const glued = (text.match(/[a-zà-öø-ÿ][A-ZÀ-Ö]/gu) ?? []).length;
        const personish = (
          text.match(
            /[A-ZÀ-ÖØ-Ý][\p{L}'’-]+(?:\s+[A-Z]\.)?(?:\s+[A-ZÀ-ÖØ-Ý][\p{L}'’-]+)+/gu,
          ) ?? []
        ).length;
        return glued >= 1 || personish >= 2;
      });
    const spacedBodyByline = pageOneBylineTexts.find((row) => {
      const text = row.text;
      if (row.x < 140 || text.length < 24 || text.length > 220) return false;
      if (looksLikeFrontiersReviewerCredit(text)) return false;
      // Never treat institute / university rows as author bylines
      // (`Collaborative Robotics and Intelligent Systems Institute…`).
      if (
        /\b(?:university|institute|department|faculty|school of|college of|laboratory)\b/i.test(
          text,
        )
      ) {
        return false;
      }
      if (!/\band\b/i.test(text)) return false;
      const commas = (text.match(/,/g) ?? []).length;
      // `Malin Siv Roppel *, Marlene Lakemann and Dagmar Starke` (one comma)
      // as well as longer comma lists.
      if (commas < 1) return false;
      if (commas < 2 && !/[*†‡]/.test(text)) return false;
      if (!/\d|[*†‡]/.test(text) && commas < 3) return false;
      return /^[A-ZÀ-ÖØ-Ý]/.test(text);
    })?.text;
    const starLeadSource = starLeadByline ? `*, ${starLeadByline}` : null;
    const bylineSource =
      gluedCamelByline?.replace(/\s+\band\b\s+/gi, ", ") ??
      starLeadSource ??
      spacedBodyByline;
    if (bylineSource) {
      const recovered = expandAuthorLine(bylineSource)
        .map((name) => name.replace(/^and\s+/i, "").replace(/[,;*]+$/g, "").trim())
        .filter(
          (name) =>
            name.split(/\s+/).length >= 2 &&
            name.split(/\s+/).length <= 5 &&
            !isNonAuthorMastheadLine(name),
        );
      if (recovered.length >= 2) {
        const authorsAreChrome =
          state.authorNames.length > 0 &&
          state.authorNames.every(
            (name) =>
              isNonAuthorMastheadLine(name) ||
              /^(?:received|revised|accepted|published|keywords?)\b/i.test(name),
          );
        // Star-lead body bylines beat Frontiers REVIEWED BY / chrome crumbs
        // when they recover a fuller person list.
        if (
          state.authorNames.length === 0 ||
          state.authorNames.length < recovered.length ||
          (state.authorNames.length === 1 && recovered.length >= 2) ||
          authorsAreChrome ||
          (Boolean(starLeadSource) &&
            recovered.length >= 2 &&
            state.authorNames.every((name) =>
              /^(?:received|revised|accepted|published|keywords?)\b/i.test(name) ||
              looksLikeFrontiersReviewerCredit(name),
            ))
        ) {
          state.authorNames = recovered;
        }
      } else if (state.authorNames.length === 0 && recovered.length === 1) {
        state.authorNames = recovered;
      }
    }
}
