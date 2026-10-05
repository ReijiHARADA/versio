"""Semantic translation-unit segmentation shared by production and benchmarks.

This is deliberately a scanner, rather than a sentence-splitting regex: PDF
paragraphs contain decimals, abbreviations and author-year citations where a
period or semicolon is not a translation boundary.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from .citation_protect import protected_span_mask

SEGMENTER_VERSION = "semantic-v84"
_ABBREVIATIONS = {"e.g.", "i.e.", "et al.", "fig.", "eqn.", "eq.", "no.", "cf.", "dr.", "mr.", "ms.", "vs."}


def is_probable_panel_fragment(text: str) -> bool:
    """Identify only a standalone panel label, not its descriptive caption.

    PDF extraction often prefixes a full sentence or caption with ``(a)`` or
    ``(b)``. Preserving such a whole unit bypasses translation entirely. The
    label itself is protected as a scientific token, so only label-only units
    should be skipped by the scheduler.
    """
    compact = _compact(text)
    return bool(re.fullmatch(r"\([a-z]\)(?:\s*[,;:]?)?", compact, re.I))


@dataclass(frozen=True)
class TranslationUnit:
    # Exact source slice. Joining ``text`` values must reconstruct the source.
    text: str
    protected: str
    # A minimally completed form sent to the model. It may differ only when a
    # relative clause needs its antecedent made explicit for independent
    # translation; source reconstruction always uses ``text``.
    model_input: str


def _compact(text: str) -> str:
    return " ".join(text.split()).strip()


def _normalize_model_input(text: str) -> str:
    """Repair high-confidence OCR/apostrophe losses only for model input.

    The source slice must remain byte-for-byte reconstructable modulo
    whitespace, but MADLAD is sensitive to malformed English such as interview
    quotes beginning with ``Its not``.  Restrict repairs to unambiguous
    pronoun contractions before negation so possessive ``its`` remains intact.
    """
    normalized = re.sub(r"\bIts\s+(?=not\b)", "It's ", text)
    # PDF text and scholarly prose sometimes insert a comma into
    # neither/nor coordination.  MADLAD has repeatedly dropped the whole
    # negative predicate from inputs like ``Neither cathodal, nor anodal ...``.
    # Removing only that optional comma preserves the logical form while
    # presenting the standard English construction to the model.
    normalized = re.sub(r"\bNeither\s+([^,.;:()]{1,80}),\s+nor\b", r"Neither \1 nor", normalized, flags=re.I)
    # Cross-reference wording extracted from PDFs sometimes appears as
    # ``along with Section 5 next``. Make the reference grammatical without
    # changing the source slice, so the model is less likely to omit the
    # section label from the translated claim.
    normalized = re.sub(
        r"\balong\s+with\s+((?:Section|Appendix)\s+(?:\d+(?:\.\d+)*|[A-Z]))\s+next,",
        r"as discussed in \1,",
        normalized,
        flags=re.I,
    )
    # Make epistemic scope explicit for a common academic construction that
    # MADLAD tends to render as a categorical negative. The paraphrase keeps
    # the same uncertainty while reducing omission of the modal meaning.
    normalized = re.sub(
        r"\bmight\s+not\s+have\s+been\s+detected\b",
        "may have gone undetected",
        normalized,
        flags=re.I,
    )
    # Some native PDF streams drop the opening parenthesis before an
    # author-year citation (`similar ways Bailenson and Yee (2007), at ...`).
    # The text is still reconstructable, but MADLAD tends to treat the author
    # name as the object of `ways` and corrupts the remainder of the clause.
    # Restore only this high-confidence citation boundary in model input; the
    # exact source slice remains unchanged for round-trip and invariant checks.
    normalized = re.sub(
        r"(?P<lead>\b(?:ways|manner|fashion)\s+)"
        r"(?P<authors>[A-Z][A-Za-z'’\-]+(?:\s+(?:and|&)\s+[A-Z][A-Za-z'’\-]+|\s+et\s+al\.)?)\s+"
        r"\((?P<year>\d{4}[a-z]?)\)(?=\s*[,.;])",
        lambda match: f"{match.group('lead')}({match.group('authors')}, {match.group('year')})",
        normalized,
    )
    # MADLAD can collapse the relation in long copular definitions of the
    # form "X is a common metric to measure A compared to B".  Present the
    # same relation as two grammatical sentences while keeping the exact
    # source slice in ``TranslationUnit.text`` for reconstruction.  This is
    # intentionally narrow: both the metric predicate and the comparative
    # phrase must be present, and no source facts are added.
    normalized = re.sub(
        r"(?P<head>\b[^.;]{1,100}\bis\s+a\s+common\s+metric)\s+to\s+measure\s+(?P<left>[^.;]{2,120})\s+compared\s+to\s+(?P<right>[^.;]{2,120})\.",
        lambda match: f"{match.group('head')}. It measures {match.group('left')} compared with {match.group('right')}.",
        normalized,
        flags=re.I,
    )
    return normalized


def _is_decimal(text: str, index: int) -> bool:
    return index > 0 and index + 1 < len(text) and text[index - 1].isdigit() and text[index + 1].isdigit()


def _is_abbreviation(text: str, index: int) -> bool:
    # Match the complete final token. A suffix check made ordinary words such
    # as ``mechanisms.`` look like the abbreviation ``ms.``, hiding a real
    # boundary and making the following sentence vulnerable to omission.
    prefix = text[: index + 1]
    # Experimental labels such as ``person B. Neither ...`` are sentence
    # endings, not author initials.  Treating the final label as an
    # abbreviation merges the following sentence into the same model input;
    # MADLAD then tends to omit the second claim.
    if re.search(r"\b(?:person|participant|option|condition|group|box|target|stimulus|case|class|category)\s+[A-Z]\.$", prefix, re.I):
        return False
    # ``et al.`` is a two-token abbreviation and must stay attached to a
    # following numeric citation such as ``et al. [8]``.
    token = re.search(r"(?:^|\s)((?:et\s+al|[A-Za-z]+(?:\.[A-Za-z]+)*)\.)$", prefix, re.I)
    return bool(token and token.group(1).lower() in _ABBREVIATIONS) or bool(re.search(r"\b[A-Z]\.$", prefix))


def _sentence_end_after_numeric_citation(text: str, period_index: int) -> int | None:
    """Return the end of a sentence-final superscript citation, if present.

    PDF text commonly emits a sentence period and its numeric citation without
    a space (``algorithm.23 Other``).  Treating the period as ordinary prose
    leaves both sentences in one translation unit, which can make the model
    drop the first claim.  Decimal values are excluded by requiring a letter
    before the period and an uppercase/quoted sentence starter after the
    citation.
    """
    if period_index <= 0 or not text[period_index - 1].isalpha():
        return None
    match = re.match(r"\.(\d{1,3})(?=\s+[^\s])", text[period_index:])
    if not match:
        return None
    after = period_index + match.end()
    starter = re.search(r"\S", text[after:])
    if not starter:
        return None
    char = text[after + starter.start()]
    # Numeric sentence starters occur frequently in review prose (`.27 10
    # studies ...`) after a bare superscript citation. They are distinct from
    # decimals because the boundary scanner only calls this after a letter
    # followed by a period and a 1–3 digit marker.
    if not (char.isupper() or char.isdigit() or char in '“‘"\'•‣▪∙'):
        return None
    return after


def _advance_quote_state(quote: str | None, char: str) -> str | None:
    """Track straight and typographic quotation pairs without leaking state.

    Native PDF text routinely uses curly opening/closing marks.  Treating
    `“` and `”` as independent toggles leaves the scanner in quote mode for
    the remainder of a paragraph, suppressing every later sentence boundary.
    """
    if char in '\"\'':
        return None if quote == char else char
    if char in "“‘":
        return char
    if char == "”":
        return None if quote == "“" else quote
    if char == "’":
        return None if quote == "‘" else quote
    return quote


def _is_quote_marker(text: str, index: int) -> bool:
    char = text[index]
    if char not in '\"\'“”‘’':
        return False
    # An ASCII apostrophe inside a word is a contraction/possessive, not an
    # opening quote (for example, "doesn't" or "model's"). A trailing
    # apostrophe in plural possessives (``linguistics' cognition``) has no
    # alphanumeric character on its right, but is still part of the word.
    if char == "'" and 0 < index < len(text) - 1:
        if text[index - 1].isalnum():
            return False
    return True


def _boundary_positions(text: str) -> list[int]:
    positions: list[int] = []
    paren = square = brace = 0
    quote: str | None = None
    for i, char in enumerate(text):
        if _is_quote_marker(text, i):
            quote = _advance_quote_state(quote, char)
            continue
        if quote:
            # A sentence-final period is often inside a closing quotation
            # mark: `... “condition.” Participants ...`.  Waiting for the
            # closing mark before considering boundaries leaves the next
            # sentence glued to the quoted condition.  Treat the paired
            # punctuation+closing-mark as one boundary while preserving the
            # exact source slice.
            if char in ".!?" and i + 1 < len(text) and text[i + 1] in '”"':
                after = i + 2
                if after == len(text) or text[after].isspace():
                    positions.append(after)
                    continue
            continue
        if char == "(": paren += 1
        elif char == ")": paren = max(0, paren - 1)
        elif char == "[": square += 1
        elif char == "]": square = max(0, square - 1)
        elif char == "{": brace += 1
        elif char == "}": brace = max(0, brace - 1)
        elif char in ".!?" and not (paren or square or brace):
            if char == "." and (_is_decimal(text, i) or _is_abbreviation(text, i)):
                continue
            if char == ".":
                citation_end = _sentence_end_after_numeric_citation(text, i)
                if citation_end is not None:
                    positions.append(citation_end)
                    continue
            if i + 1 == len(text) or text[i + 1].isspace():
                positions.append(i + 1)
    return positions


def _merge_fragments(parts: list[str]) -> list[str]:
    merged: list[str] = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        words = part.split()
        # A top-level terminal punctuation mark already establishes a safer
        # boundary than a word such as ``But`` or ``To``.  Both are valid
        # starts for a complete academic sentence or question.  Physical PDF
        # continuations lack that preceding terminal punctuation and should be
        # repaired upstream; merging complete sentences here made model inputs
        # unnecessarily long and caused omissions.  Only truly tiny fragments
        # and standalone author-year references are merged.
        fragment = len(words) < 4 or re.fullmatch(r"[^A-Za-z]*[A-Za-z]+(?:\s+et al\.)?,?\s*\d{4};?", part)
        if fragment and merged:
            merged[-1] = f"{merged[-1]} {part}"
        else:
            merged.append(part)
    # A heading-like or page-edge prefix can be the first sentence in a
    # physical block (for example ``Related work. Linear probing ...``).
    # There is no preceding unit to absorb it, so merge it forward. Sending a
    # two-word prefix independently creates a meaningless translation request
    # and can make the whole paragraph fall back when that unit is rejected.
    if (
        len(merged) > 1
        and len(merged[0].split()) < 4
        and not merged[0].rstrip().endswith((":", "："))
    ):
        merged[1] = f"{merged[0]} {merged[1]}"
        merged.pop(0)
    return merged


def _split_list_items(text: str) -> list[str]:
    """Keep visually flattened PDF lists from becoming one model input.

    Native PDF extraction can reconstruct bullets as a single paragraph. Keep
    any lead-in sentence as its own unit, then preserve each bullet as a unit;
    omitting that lead-in would silently change the source before translation.
    """
    bullet_positions: list[int] = []
    for match in re.finditer(r"(?:^|\s)[•‣▪∙]\s+", text):
        # A match after whitespace starts at that whitespace; retain the bullet
        # itself so the joining stage can restore list structure.
        position = match.start()
        if position < len(text) and text[position].isspace():
            position += 1
        bullet_positions.append(position)
    if len(bullet_positions) < 2:
        return [text]
    boundaries = [0, *[position for position in bullet_positions if position > 0], len(text)]
    items = [text[left:right].strip() for left, right in zip(boundaries, boundaries[1:]) if text[left:right].strip()]
    # PDF extraction may omit the final bullet's line boundary and append the
    # following prose sentence directly (``... interaction Our work ...``).
    # Split only after a sufficiently long bullet and at a sentence-like
    # uppercase clause starter; ordinary short bullet text is untouched.
    expanded: list[str] = []
    for item in items:
        match = re.search(
            r"(?<=\w)\s+(?=(?:Our|This|These|The|In|We)\s+(?:work|paper|study|results|method|system|findings|approach)\b)",
            item[2:] if item.startswith(("• ", "‣ ", "▪ ", "∙ ")) else item,
        ) if len(item.split()) >= 12 else None
        if match:
            offset = 2 if item.startswith(("• ", "‣ ", "▪ ", "∙ ")) else 0
            cut = match.start() + offset
            expanded.extend([item[:cut].strip(), item[cut:].strip()])
        else:
            expanded.append(item)
    return [item for item in expanded if item]


def _split_inline_enumeration(text: str) -> list[str]:
    """Separate a prose lead-in from a flattened numbered inline list.

    Native PDF extraction can turn ``(1) …; (2) …; (3) …`` into a single
    model input. Greedy decoding then tends to omit the middle conditions.
    Require at least two ordinal markers so equations and ordinary
    parenthetical numbers remain part of their surrounding sentence.
    """
    # A numeric parenthesis is also common statistical syntax (H(2), F(4,33),
    # etc.). Treat it as an item marker only at a list boundary and when prose
    # follows it. In particular, `(2) = 6.06` is a degrees-of-freedom token,
    # not an ordinal item. Requiring a leading colon/semicolon/start boundary
    # prevents parentheses embedded in ordinary sentences from becoming cuts.
    markers = [
        match
        for match in re.finditer(r"\(\d{1,2}\)", text)
        if (
            match.start() == 0
            or re.search(r"[:;]\s*$", text[: match.start()])
            # Superscript reference numbers are sometimes emitted after the
            # sentence punctuation without a space (`migration.3 (2) ...`).
            # At a numbered-item boundary this is still a sentence/list edge,
            # not one long translation unit. Excluding a digit before the
            # punctuation keeps decimal values from matching.
            or re.search(r"(?<!\d)[.!?](?:\d{1,3})?\s*$", text[: match.start()])
        )
        and re.match(r"\s+[A-Za-z]", text[match.end() :])
    ]
    if len(markers) < 2:
        return [text]
    starts = [0, *[match.start() for match in markers]]
    ends = [*starts[1:], len(text)]
    return [text[left:right].strip() for left, right in zip(starts, ends) if text[left:right].strip()]


def _split_overlong_safe_clauses(text: str) -> list[str]:
    """Split only genuinely overlong prose at a top-level semicolon.

    Semicolons are not ordinary sentence boundaries.  They become useful only
    when a single unit is long enough to cause greedy omissions and both sides
    are substantial clauses. Protected citation spans are masked first, so an
    author-year citation list can never supply the split point.
    """
    # A semicolon can join two independent research claims well below the
    # model's context limit.  Leaving those together lets greedy decoding keep
    # the first claim while silently dropping the second.  Citation spans are
    # already masked and short rhetorical clauses remain intact below.
    if len(text) <= 220:
        return [text]
    masked = protected_span_mask(text)
    candidates: list[int] = []
    top_level_semicolons = 0
    paren = square = brace = 0
    quote: str | None = None
    for i, char in enumerate(masked):
        if _is_quote_marker(masked, i):
            quote = _advance_quote_state(quote, char)
            continue
        if quote:
            continue
        if char == "(": paren += 1
        elif char == ")": paren = max(0, paren - 1)
        elif char == "[": square += 1
        elif char == "]": square = max(0, square - 1)
        elif char == "{": brace += 1
        elif char == "}": brace = max(0, brace - 1)
        elif char == ";" and not (paren or square or brace):
            top_level_semicolons += 1
            if i >= 90 and len(text) - i - 1 >= 80:
                candidates.append(i + 1)
    # Multiple top-level semicolons are often a flattened screening/list or a
    # sequence of closely related claims. Splitting each clause creates units
    # that begin with continuation words and loses the shared context. Keep
    # the logical unit intact; sentence punctuation or the retry-only rescue
    # can still provide a safe boundary later. Citation semicolons are already
    # masked and therefore do not affect this count.
    if top_level_semicolons >= 2:
        return [text]
    if not candidates:
        # Figure/artwork captions often start with a short quoted title and a
        # figure marker, then use one semicolon before a much longer material
        # description. This is structurally different from prose: preserving
        # the title phrase as its own unit keeps greedy decoding from dropping
        # the latter description. Do not generalize this to arbitrary short
        # semicolon clauses.
        lead = re.match(r"^[\"“‘][^\"”’]{1,100}[\"”’]\s*\((?:fig(?:ure)?\.?\s*\d+[A-Za-z]?)\)[^;]{0,120};", text, re.I)
        if lead and len(text) - lead.end() >= 120:
            return [text[:lead.end()].strip(), text[lead.end():].strip()]
        return [text]
    split = min(candidates, key=lambda index: abs(len(text) / 2 - index))
    return [text[:split].strip(), text[split:].strip()]


def _complete_long_colon_predicate_list(text: str) -> list[tuple[str, str]]:
    """Split a long ``Model: it does …, does …`` predicate list safely.

    Greedy decoding commonly translates only the first predicate after a
    colon.  This is distinct from ordinary comma prose: require an explicit
    technical/model subject and at least three substantial coordinated
    predicates.  Source slices retain every comma; only the model-facing form
    repeats the already-mentioned subject so each predicate is grammatical in
    isolation.
    """
    if len(text) < 240:
        return [(text, text)]
    masked = protected_span_mask(text)
    colon = next((i for i, char in enumerate(masked) if char == ":"), -1)
    if colon < 50 or len(text) - colon < 150:
        return [(text, text)]
    prefix, tail = text[: colon + 1].strip(), text[colon + 1 :].strip()
    subjects = re.findall(r"\b(?:[A-Z]{2,}[A-Za-z0-9-]*|[A-Z][A-Za-z]*-\d+)\b", prefix)
    if not subjects:
        return [(text, text)]
    subject = subjects[-1]
    # Only predicate lists headed by a pronoun or verb are completed.  A
    # colon introducing a definition, a citation, or a table stays intact.
    if not re.match(r"(?:it\s+)?(?:is\s+able\s+to|[a-z]+(?:s|es)\b)", tail, re.I):
        return [(text, text)]
    spans: list[tuple[int, int]] = []
    start = 0
    paren = square = brace = 0
    for i, char in enumerate(protected_span_mask(tail)):
        if char == "(": paren += 1
        elif char == ")": paren = max(0, paren - 1)
        elif char == "[": square += 1
        elif char == "]": square = max(0, square - 1)
        elif char == "{": brace += 1
        elif char == "}": brace = max(0, brace - 1)
        elif char == "," and not (paren or square or brace):
            spans.append((start, i + 1))
            start = i + 1
    spans.append((start, len(tail)))
    pieces = [tail[left:right].strip() for left, right in spans if tail[left:right].strip()]
    if len(pieces) < 3 or any(len(piece) < 30 for piece in pieces):
        return [(text, text)]
    completed: list[tuple[str, str]] = [(prefix, prefix.rstrip(":") + ".")]
    for piece in pieces:
        predicate = piece.rstrip(",.").strip()
        predicate = re.sub(r"^(?:it\s+|and\s+)", "", predicate, flags=re.I)
        if not re.match(r"(?:is\s+able\s+to|[a-z]+(?:s|es)\b)", predicate, re.I):
            return [(text, text)]
        completed.append((piece, f"{subject} {predicate}."))
    return completed


def _complete_long_relative_clause(text: str) -> list[tuple[str, str]]:
    """Make a long relative clause independently translatable without editing source.

    A model often drops the content after ``..., in which participants ...``
    when the full sentence is long.  The relative clause is semantically
    dependent, so emitting it as bare ``in which ...`` is also unsafe.  Keep
    exact source slices for reconstruction but send the second unit as ``In
    this context, participants ...``.  The antecedent is already translated
    by the preceding unit and no paper-specific fact is introduced.
    """
    if len(text) < 220:
        return [(text, text)]
    match = re.search(
        r",\s+(in\s+which)\s+(participants\s+(?:are|were)\s+(?:asked|shown|given|told)\b.+)$",
        text,
        re.IGNORECASE,
    )
    if not match:
        return [(text, text)]
    prefix = text[: match.start() + 1].strip()
    clause = text[match.start() + 1 :].strip()
    body = match.group(2).strip()
    if len(prefix) < 70 or len(clause) < 90:
        return [(text, text)]
    # Restrict the antecedent to common scholarly entities. This avoids
    # recasting arbitrary prose merely because it contains a relative clause.
    if not re.search(r"\b(?:problem|task|study|experiment|method|model|system|case)\b", prefix, re.I):
        return [(text, text)]
    return [
        (prefix, prefix.rstrip(",") + "."),
        (clause, f"In this context, {body}"),
    ]


def _split_rescue_at(text: str, index: int, left_model: str, right_model: str) -> list[TranslationUnit]:
    left = text[:index].strip()
    right = text[index:].strip()
    if not left or not right:
        return []
    return [
        TranslationUnit(left, protected_span_mask(left), left_model),
        TranslationUnit(right, protected_span_mask(right), right_model),
    ]


def _rescue_em_dash_coordination(text: str) -> list[TranslationUnit]:
    """Retry a complete claim split at a top-level em dash.

    Academic prose often uses an em dash to introduce the observable
    consequence of a setup clause.  A failed decode can keep only one side.
    Split only when both sides are substantial, delimiter-balanced clauses;
    this is a retry-only operation and preserves the original source slices.
    """
    if len(text) < 150 or text.count("\u2013") + text.count("\u2014") != 1:
        return []
    masked = protected_span_mask(text)
    match = re.search(r"\s+[\u2013\u2014]\s+", masked)
    if not match:
        return []
    left = text[:match.start()].strip()
    right = text[match.end():].strip()
    if len(left.split()) < 12 or len(right.split()) < 12:
        return []
    if any(left.count(a) != left.count(b) for a, b in (("(", ")"), ("[", "]"), ("{", "}"))):
        return []
    if any(right.count(a) != right.count(b) for a, b in (("(", ")"), ("[", "]"), ("{", "}"))):
        return []
    left_model = left.rstrip(" ,;:") + "."
    right_model = right[0].upper() + right[1:] if right else right
    return _split_rescue_at(text, match.start(), left_model, right_model)


def _rescue_found_that_coordination(text: str) -> list[TranslationUnit]:
    """Recover ``found that A and that B`` units after greedy omission.

    Production segmentation keeps these sentences intact because the source is
    grammatical.  If MADLAD later drops one coordinated finding, the retry can
    make each finding explicit without changing the source slices that will be
    rejoined.
    """
    if len(text) < 180:
        return []
    masked = protected_span_mask(text)
    match = re.search(r"\bfound\s+that\b", masked, re.I)
    if not match:
        return []
    split = re.search(r"\s+and\s+that\s+", masked[match.end():], re.I)
    if not split:
        return []
    split_index = match.end() + split.start()
    left = text[:split_index].strip()
    right = text[split_index:].strip()
    if len(left) < 80 or len(right) < 80:
        return []
    right_body = re.sub(r"^and\s+that\s+", "", right, flags=re.I).strip()
    return _split_rescue_at(
        text,
        split_index,
        left.rstrip(",;") + ".",
        "They found that " + right_body,
    )


def _rescue_if_so_semicolon(text: str) -> list[TranslationUnit]:
    """Split a question with a top-level ``; if so,`` continuation."""
    masked = protected_span_mask(text)
    match = re.search(r";\s+if\s+so,\s+", masked, re.I)
    if not match:
        return []
    left = text[: match.start()].strip()
    right = text[match.start() + 1 :].strip()
    if len(left.split()) < 8 or len(right.split()) < 8:
        return []
    return _split_rescue_at(
        text,
        match.start() + 1,
        left.rstrip(",;") + ".",
        right[0].upper() + right[1:] if right else right,
    )


def _rescue_top_level_semicolon_sequence(text: str) -> list[TranslationUnit]:
    """Retry a long multi-semicolon paragraph as balanced clause units."""
    if len(text) < 220:
        return []
    masked = protected_span_mask(text)
    positions: list[int] = []
    paren = square = brace = 0
    for i, char in enumerate(masked):
        if char == "(": paren += 1
        elif char == ")": paren = max(0, paren - 1)
        elif char == "[": square += 1
        elif char == "]": square = max(0, square - 1)
        elif char == "{": brace += 1
        elif char == "}": brace = max(0, brace - 1)
        elif char == ";" and not (paren or square or brace): positions.append(i + 1)
    if len(positions) < 2:
        return []
    bounds = [0, *positions, len(text)]
    parts = [text[left:right].strip() for left, right in zip(bounds, bounds[1:]) if text[left:right].strip()]
    merged: list[str] = []
    for part in parts:
        if merged and len(part.split()) < 8:
            merged[-1] = f"{merged[-1]} {part}"
        else:
            merged.append(part)
    if len(merged) < 2 or any(len(part.split()) < 8 for part in merged):
        return []
    return [
        TranslationUnit(
            part,
            protected_span_mask(part),
            _normalize_model_input(part.rstrip(" ;") + ("." if index < len(merged) - 1 else "")),
        )
        for index, part in enumerate(merged)
    ]


def _rescue_nonrestrictive_where_clause(text: str) -> list[TranslationUnit]:
    """Make concise ``..., where property list ...`` clauses explicit.

    These clauses are frequent in methods prose.  MADLAD often summarizes the
    main clause and omits the property list; retrying the second slice as
    ``In this context, ...`` keeps the fact-bearing clause available while the
    exact source text remains reconstructable.
    """
    if len(text) < 100:
        return []
    match = re.search(r",\s+(where\s+[^.?!]+[.?!]?)$", text, re.I)
    if not match:
        return []
    prefix = text[: match.start() + 1].strip()
    clause = text[match.start() + 1 :].strip()
    body = re.sub(r"^where\s+", "", clause, flags=re.I).strip()
    if len(prefix.split()) < 8 or len(body.split()) < 6:
        return []
    # Favor fact-heavy property clauses; avoid rewriting arbitrary narrative.
    if not re.search(r"\b(?:size|weight|form factor|power|efficiency|rate|temperature|accuracy|latency|performance|value|condition|participants?)\b", body, re.I):
        return []
    return _split_rescue_at(
        text,
        match.start() + 1,
        prefix.rstrip(",") + ".",
        "In this context, " + body,
    )


def _rescue_appositive_region_clause(text: str) -> list[TranslationUnit]:
    """Split a long appositive ``..., a region ...`` fact clause."""
    if len(text) < 180:
        return []
    match = re.search(r",\s+(a\s+region\s+[^.?!]+[.?!]?)$", text, re.I)
    if not match:
        return []
    prefix = text[: match.start() + 1].strip()
    clause = text[match.start() + 1 :].strip()
    body = re.sub(r"^a\s+region\s+with\s+", "", clause, flags=re.I).strip()
    if len(prefix.split()) < 10 or len(body.split()) < 8:
        return []
    return _split_rescue_at(
        text,
        match.start() + 1,
        prefix.rstrip(",") + ".",
        "This region has " + body,
    )



def _rescue_while_concessive_main_clause(text: str) -> list[TranslationUnit]:
    """Recover long ``While/Although ... , main clause`` scientific prose.

    Normal segmentation keeps the sentence intact because it is grammatical.
    When greedy decoding translates only the main clause, retry the concessive
    setup as an explicit complete sentence and the main clause separately while
    preserving exact source slices for reconstruction.
    """
    if len(text) < 170:
        return []
    masked = protected_span_mask(text)
    if not re.match(r"^(?:while|although)\s+", masked, re.I):
        return []
    paren = square = brace = 0
    split_index = -1
    for i, char in enumerate(masked):
        if char == "(":
            paren += 1
        elif char == ")":
            paren = max(0, paren - 1)
        elif char == "[":
            square += 1
        elif char == "]":
            square = max(0, square - 1)
        elif char == "{":
            brace += 1
        elif char == "}":
            brace = max(0, brace - 1)
        elif char == "," and not (paren or square or brace):
            split_index = i + 1
            break
    if split_index < 60 or len(text) - split_index < 60:
        return []
    left = text[:split_index].strip()
    right = text[split_index:].strip()
    if not re.match(
        r"(?:directly\s+)?[a-z]+ing\b|(?:this|these|the|it|they|we|a|an)\b|[A-Z][A-Za-z0-9-]*\b",
        right,
    ):
        return []
    left_body = re.sub(r"^(?:while|although)\s+", "", left.rstrip(", "), flags=re.I).strip()
    if not left_body or not right:
        return []
    left_model = left_body[0].upper() + left_body[1:]
    if left_model[-1:] not in ".!?":
        left_model += "."
    right_model = right[0].upper() + right[1:]
    return _split_rescue_at(text, split_index, left_model, right_model)


def _rescue_top_level_conjunction(text: str) -> list[TranslationUnit]:
    """Retry a long sentence split at a top-level clause conjunction.

    This is intentionally retry-only: commas inside citations/parentheses are
    ignored, and both clauses must be substantial. The original source slices
    remain exact while the model inputs receive a sentence-final marker.
    """
    # MADLAD can omit the first clause in roughly 200–260 character academic
    # sentences, so the retry/proactive boundary must cover that range too.
    # The structural guards below still require a top-level conjunction and
    # substantial clauses on both sides.
    if len(text) < 200:
        return []
    masked = protected_span_mask(text)
    for match in re.finditer(r",\s+(but|however|while|which|and)\s+", masked, re.I):
        prefix = masked[:match.start()]
        if prefix.count("(") != prefix.count(")") or prefix.count("[") != prefix.count("]"):
            continue
        left = text[: match.start() + 1].strip()
        right = text[match.start() + 1 :].strip()
        if len(left.split()) < 12 or len(right.split()) < 10:
            continue
        left_model = left.rstrip(",") + "."
        right_model = right[0].upper() + right[1:] if right else right
        return _split_rescue_at(text, match.start() + 1, left_model, right_model)
    return []


def _rescue_hence_clause(text: str) -> list[TranslationUnit]:
    """Retry a top-level `, hence that ...` clause as a complete unit.

    A hypothesis sentence can contain a short reporting clause followed by a
    consequence introduced with ``hence that``.  Greedy decoding sometimes
    keeps only the first clause; both slices are meaningful when sentence
    punctuation is supplied to the model, and the source reconstruction stays
    exact.  Parenthesized citations and nested commas are excluded.
    """
    if len(text) < 160:
        return []
    masked = protected_span_mask(text)
    match = re.search(r",\s+hence\s+that\s+", masked, re.I)
    if not match:
        return []
    left = text[: match.start() + 1].strip()
    right = text[match.start() + 1 :].strip()
    if len(left.split()) < 10 or len(right.split()) < 8:
        return []
    if left.count("(") != left.count(")") or right.count("(") != right.count(")"):
        return []
    left_model = left.rstrip(",") + "."
    right_model = right[0].upper() + right[1:] if right else right
    return _split_rescue_at(text, match.start() + 1, left_model, right_model)


def _rescue_discourse_marker_clause(text: str) -> list[TranslationUnit]:
    """Retry a long sentence at a top-level discourse marker.

    Markers such as ``to our knowledge`` and ``in our view`` introduce a
    separate claim after a long evidence clause.  MADLAD can preserve only
    that final claim, especially when the preceding clause contains a list of
    citations or acronyms.  Split only at a delimiter-aware comma and keep
    both source slices exact; the model inputs receive sentence boundaries so
    neither side is sent as an orphaned continuation.
    """
    if len(text) < 160:
        return []
    masked = protected_span_mask(text)
    match = re.search(
        r",\s+(?P<marker>to\s+our\s+knowledge|in\s+our\s+view|from\s+our\s+perspective|therefore|thus),\s+",
        masked,
        re.IGNORECASE,
    )
    if not match:
        return []
    left = text[: match.start() + 1].strip()
    right = text[match.start() + 1 :].strip()
    if len(left.split()) < 14 or len(right.split()) < 8:
        return []
    if any(left.count(opening) != left.count(closing) for opening, closing in (("(", ")"), ("[", "]"), ("{", "}"))):
        return []
    left_model = left.rstrip(",") + "."
    right_model = right[0].upper() + right[1:] if right else right
    return _split_rescue_at(text, match.start() + 1, left_model, right_model)


def _rescue_as_well_as_clause(text: str) -> list[TranslationUnit]:
    """Retry a long coordinated ``as well as`` evidence clause.

    Citation-heavy literature reviews often coordinate two substantial
    findings with ``as well as``.  When the first coordinated list contains an
    acronym, MADLAD may emit only the final claim.  Split only long,
    top-level coordinates and give each model input an explicit subject;
    source slices remain unchanged for exact reconstruction.
    """
    if len(text) < 220:
        return []
    masked = protected_span_mask(text)
    match = re.search(r"\s+as\s+well\s+as\s+", masked, re.IGNORECASE)
    if not match:
        return []
    left = text[: match.start()].strip()
    # Keep the coordinator in the exact right-hand source slice so the
    # concatenated slices reconstruct the input byte-for-byte (after spacing
    # normalization).
    right = text[match.start() :].strip()
    if len(left.split()) < 10 or len(right.split()) < 10:
        return []
    if any(left.count(opening) != left.count(closing) for opening, closing in (("(", ")"), ("[", "]"), ("{", "}"))):
        return []
    # Remove a subordinate leading marker only in the model-facing text; the
    # original slice and its relation are preserved for reconstruction.
    left_model = re.sub(r"^while\s+", "", left, flags=re.IGNORECASE).rstrip(",") + "."
    right_model = "It also examined " + text[match.end() :].strip() if right else right
    left_unit = TranslationUnit(left, protected_span_mask(left), left_model)
    # Apply the same safe discourse split to the second coordinate when it
    # contains a trailing ``to our knowledge`` claim. This keeps each retry
    # unit substantive instead of asking one decode to handle both a citation
    # list and a long qualification.
    nested = _rescue_discourse_marker_clause(right)
    if len(nested) > 1:
        nested[0] = TranslationUnit(
            nested[0].text,
            nested[0].protected,
            "It also examined "
            + re.sub(r"^as\s+well\s+as\s+", "", nested[0].model_input, flags=re.IGNORECASE),
        )
        return [left_unit, *nested]
    return [left_unit, TranslationUnit(right, protected_span_mask(right), right_model)]


def _rescue_top_level_clause_comma(text: str) -> list[TranslationUnit]:
    """Last-resort retry split for an exceptionally long comma-bound sentence.

    This is deliberately restricted to retry-only use.  A top-level comma near
    the middle of a 300+ character sentence is considered only when both sides
    are substantial clauses; citation/layout commas are masked or rejected.
    The source slices remain exact while model inputs receive terminal
    punctuation so neither fragment is sent as an orphaned continuation.
    """
    if len(text) < 300:
        return []
    masked = protected_span_mask(text)
    candidates: list[int] = []
    depth = {"(": 0, "[": 0, "{": 0}
    for i, char in enumerate(masked):
        if char in "([{":
            depth[char] += 1
        elif char in ")]}":
            opener = {')': '(', ']': '[', '}': '{'}[char]
            depth[opener] = max(0, depth[opener] - 1)
        elif char == "," and not any(depth.values()):
            left = text[: i + 1].strip()
            right = text[i + 1 :].strip()
            if len(left) >= 110 and len(right) >= 100 and len(left.split()) >= 14 and len(right.split()) >= 12:
                candidates.append(i + 1)
    if not candidates:
        return []
    split = min(candidates, key=lambda index: abs(len(text) / 2 - index))
    left = text[:split].strip().rstrip(",") + "."
    right = text[split:].strip()
    if not right:
        return []
    right_model = right[0].upper() + right[1:]
    return _split_rescue_at(text, split, left, right_model)

def rescue_units_for_translation(source: str) -> list[TranslationUnit]:
    """Return retry-only units for a source chunk that decoded poorly.

    The normal segmenter is precision-first.  This function is called only
    after the model produced a degenerate or implausibly short translation for
    an otherwise valid source unit.  It therefore uses slightly more aggressive
    but still syntactically motivated splits to recover translation instead of
    falling back to the entire paragraph.
    """
    compact = _compact(source)
    if not compact:
        return []
    for splitter in (
        _rescue_em_dash_coordination,
        _rescue_hence_clause,
        _rescue_as_well_as_clause,
        _rescue_discourse_marker_clause,
        _rescue_while_concessive_main_clause,
        _rescue_found_that_coordination,
        _rescue_if_so_semicolon,
        _rescue_top_level_semicolon_sequence,
        _rescue_nonrestrictive_where_clause,
        _rescue_appositive_region_clause,
        _rescue_top_level_conjunction,
        _rescue_top_level_clause_comma,
    ):
        units = splitter(compact)
        if len(units) > 1 and validate_round_trip(compact, [unit.text for unit in units]):
            return units
    return []


def segment_for_translation(source: str) -> list[TranslationUnit]:
    """Protect first, split only at top-level sentence punctuation, then restore.

    Semicolon is intentionally never a normal boundary.  Long sentences remain
    intact rather than producing citation-only input for MADLAD.
    """
    compact = _compact(source)
    if not compact:
        return [TranslationUnit(source, protected_span_mask(source), _normalize_model_input(source))]
    # Protect before segmentation with an equal-length mask, so offsets still
    # slice the original text while citation/scientific punctuation cannot make
    # a boundary. Each resulting unit is then placeholder-protected immediately
    # before MADLAD generate and restored afterwards.
    parts: list[str] = []
    for list_part in _split_list_items(compact):
        for enumerated_part in _split_inline_enumeration(list_part):
            protected_part = protected_span_mask(enumerated_part)
            starts = [0, *_boundary_positions(protected_part)]
            sentence_parts = (
                enumerated_part[left:right].strip()
                for left, right in zip(starts, [*starts[1:], len(enumerated_part)])
            )
            for sentence_part in sentence_parts:
                parts.extend(_split_overlong_safe_clauses(sentence_part))
    parts = _merge_fragments(parts)
    # Concessive clauses are a recurrent decode-risk: the model may keep only
    # the main clause even when the source sentence is grammatical.  Apply the
    # same delimiter-aware split proactively for long units, rather than
    # waiting for a later quality failure.  The helper preserves exact source
    # slices and is restricted to an explicit top-level comma boundary.
    expanded: list[str] = []
    proactive_inputs: dict[str, str] = {}
    for part in parts:
        # Very long single sentences are unsafe model units even when their
        # punctuation is grammatically valid.  Use the existing
        # delimiter-aware comma rescue only at this high threshold and only
        # when both sides are substantial; ordinary academic sentences and
        # citation groups therefore keep their original unit.
        rescue = _rescue_top_level_clause_comma(part) if len(part) >= 900 else []
        # Keep ordinary sentence-sized concessive clauses intact. Splitting a
        # short subordinate clause creates a low-context unit that MADLAD may
        # reject even when the complete sentence is translatable; reserve the
        # proactive rewrite for genuinely long units where decode drift is a
        # greater risk.
        if not rescue:
            rescue = _rescue_while_concessive_main_clause(part) if len(part) >= 260 else []
        # Proactively split only concessive/contrastive conjunctions. Plain
        # ``and`` remains retry-only because it is common in statistical
        # result prose and can create unnecessary short units.
        if (
            not rescue
            and len(part) >= 200
            and ";" not in part
            and not re.match(r"^[a-z]", part)
            and re.search(r",\s+(?:while|however|but)\b", part, re.I)
        ):
            rescue = _rescue_top_level_conjunction(part)
        if rescue:
            expanded.extend(unit.text for unit in rescue)
            proactive_inputs.update({unit.text: unit.model_input for unit in rescue})
        else:
            expanded.append(part)
    parts = expanded
    units: list[TranslationUnit] = []
    for part in parts:
        for colon_source, colon_input in _complete_long_colon_predicate_list(part):
            for source_slice, model_input in _complete_long_relative_clause(colon_source):
                # A colon-list completion and relative-clause completion do
                # not both rewrite the same model input; the former is already
                # an independent predicate sentence.
                if colon_input != colon_source:
                    model_input = colon_input
                units.append(
                    TranslationUnit(
                        source_slice,
                        protected_span_mask(source_slice),
                        proactive_inputs.get(source_slice, _normalize_model_input(model_input)),
                    )
                )
    return units or [TranslationUnit(compact, protected_span_mask(compact), _normalize_model_input(compact))]


def split_for_translation(source: str) -> list[str]:
    return [unit.text for unit in segment_for_translation(source)]


def model_inputs_for_translation(source: str) -> list[str]:
    """Return model-facing inputs aligned one-to-one with source units."""
    return [unit.model_input for unit in segment_for_translation(source)]


def validate_round_trip(source: str, units: list[str]) -> bool:
    return _compact(source) == _compact(" ".join(units))
