"""Protect scientific invariants around MADLAD generate / restore after.

Placeholders are ASCII tokens chosen so greedy MADLAD decoding tends to copy
them rather than translate or drop them. Measured against the fixed
benchmarks/corpus.json citation case (see tests/test_citation_protect.py and
scripts/bench_citation_protect.py).
"""

from __future__ import annotations

import os
import re

# Bump this whenever source-fact protection rules change. It participates in
# the server translation/cache identity so old accepts are not reused silently.
SOURCE_PROTECTION_VERSION = "source-protect-v25"
QUOTED_EXAMPLE_PROTECTION_VERSION = "quoted-example-v1"

# Repeated title-case technical names are factual identifiers even when they
# do not contain an internal capital transition (for example ``Bluetooth``).
# Protect only repeated, sufficiently long tokens so ordinary sentence-initial
# words and one-off proper names remain available to the translator.
REPEATED_TITLE_CASE_TOKEN_RE = re.compile(r"\b[A-Z][a-z][A-Za-z0-9]{4,}\b")
_COMMON_TITLE_CASE_WORDS = {
    "Although", "Before", "Because", "Between", "During", "Figure",
    "However", "Moreover", "Nothing", "Results", "Section", "These",
    "Their", "There", "Therefore", "Those", "Through", "Using", "Where",
    "Which", "While", "Within",
    # Generic framework names are semantic context, not opaque identifiers.
    # Protecting repeated words such as `Theory` creates fragile placeholders
    # that MADLAD may drop from otherwise ordinary academic prose.
    "Theory", "Reasoned", "Action", "Planned", "Behavior", "Model",
}

# Adjacent model/identifier lists are one factual unit. Protecting each item
# separately can produce several placeholders in a short clause (`BERT,
# DeBERTa, and GPT`), which greedy decoding is prone to drop or reorder.
# Keep the list atomic while leaving surrounding prose available to translate.
IDENTIFIER_GROUP_RE = re.compile(
    r"(?<![A-Za-z])"
    r"(?:(?:[A-Z]{2,}[A-Za-z0-9-]*|[A-Za-z]*[a-z][A-Z][A-Za-z0-9]*)\s*,\s*){1,}"
    r"(?:and\s+|or\s+)?(?:[A-Z]{2,}[A-Za-z0-9-]*|[A-Za-z]*[a-z][A-Z][A-Za-z0-9]*)"
    r"(?![A-Za-z0-9])"
)


def _repeated_title_case_matches(text: str) -> list[re.Match[str]]:
    matches = list(REPEATED_TITLE_CASE_TOKEN_RE.finditer(text))
    counts = {}
    for match in matches:
        token = match.group(0)
        counts[token] = counts.get(token, 0) + 1
    return [
        match for match in matches
        if counts[match.group(0)] >= 2
        and match.group(0) not in _COMMON_TITLE_CASE_WORDS
    ]


def _is_example_parenthetical_identifier(text: str, match: re.Match[str]) -> bool:
    """Leave ordinary model-name examples readable instead of placeholdering.

    Acronyms inside ``(e.g., BERT, DeBERTa)`` are already checked by the
    post-decode scientific invariant gate. Replacing each with a placeholder
    makes a short example list unnecessarily fragile, especially when the
    sentence contains another example list later on.
    """
    opening = text.rfind("(", 0, match.start())
    closing = text.find(")", match.end())
    if opening < 0 or closing < 0:
        return False
    prefix = text[opening:match.start()]
    return bool(re.search(r"\be\.g\.,?\s*$", prefix, re.IGNORECASE))

# Numeric citations only: [8], [12], [1, 3], [12,13], [1-4], [1–4], [1, 3–5, 8]
CITATION_RE = re.compile(
    r"\["
    r"\d+(?:\s*[-–—]\s*\d+)?"
    r"(?:\s*,\s*\d+(?:\s*[-–—]\s*\d+)?)*"
    r"\]"
)

# Native PDF extraction often concatenates a superscript bibliography marker
# to the preceding quoted/word token: ``“cab problem”16 (Cab, see Appendix)``.
# The following parenthesis is the high-precision context that distinguishes a
# reference marker from ordinary identifiers such as X16 or a year.
INLINE_FOOTNOTE_CITATION_RE = re.compile(
    r"(?:(?<=[\"”’])|(?<=[A-Za-z]))\d{1,3}(?=\s*\()"
)

# Some publisher PDFs attach a short footnote marker directly before sentence
# punctuation (`simulations14.`). Restrict this to a lowercase word boundary
# and a 1–2 digit marker so ordinary years and alphanumeric identifiers stay
# translatable.
INLINE_TERMINAL_FOOTNOTE_RE = re.compile(r"(?<=[a-z])\d{1,2}(?=[.!?,])")

# Some PDFs attach a reference marker after terminal punctuation and before a
# flattened next list item (`... migration.3 (2) The positive effects ...`).
# After list segmentation, this citation is the terminal `.<sup>3</sup>` of
# the first unit. Require punctuation plus a preceding non-digit to avoid
# capturing the last digit of a decimal such as `0.01`.
TERMINAL_SUPERSCRIPT_CITATION_RE = re.compile(r"(?<=[^\d][.!?])\d{1,3}$")

# Some publishers render clustered numeric citations as unbracketed
# superscripts attached to the preceding word: ``unconditionally29,30,32``.
# A comma-separated cluster is a high-precision reference signal; a lone
# suffix (for example P1 or COVID19) is deliberately not treated as citation.
INLINE_NUMERIC_CITATION_RE = re.compile(
    r"(?<=[A-Za-z])"
    r"\d{1,3}(?:\s*[-–—]\s*\d{1,3})?"
    r"(?:\s*,\s*\d{1,3}(?:\s*[-–—]\s*\d{1,3})?)+"
)

# A number of journal PDFs render bibliography references as bare superscripts
# attached to a word or punctuation (`coaching29`, `tool,31`, `EHR)30`,
# `infection.30`).  The previous patterns covered clusters and terminal
# markers but left these single references translatable, so a decoder could
# omit them while the client invariant gate only discovered the loss later.
# Keep the context deliberately narrow: require either four preceding
# lowercase letters, a closing/list punctuation mark, or a period that is not
# part of a decimal. Sentence-boundary logic separately decides whether the
# following text starts a new sentence.
INLINE_BARE_REFERENCE_RE = re.compile(
    r"(?:"
    r"(?:(?<=[a-z]{4})|(?<=[)\],;:]))\d{1,3}(?=\s|[.,;:)]|$)"
    r"|(?<!\d)(?<=\.)\d{1,3}(?=\s|$)"
    r")"
)
_BARE_REFERENCE_IDENTIFIER_WORDS = {
    "version", "model", "type", "step", "part", "chapter", "page",
    "item", "table", "figure", "sample", "group", "condition", "trial",
    "study", "factor", "case", "number", "example", "method", "dataset",
    "class", "level", "round", "block", "section",
}


def _bare_reference_matches(text: str) -> list[re.Match[str]]:
    matches = []
    for match in INLINE_BARE_REFERENCE_RE.finditer(text):
        # A comma inside a thousands-grouped number (`3,227`) is not a
        # superscript citation. The generic punctuation lookbehind above must
        # not turn the trailing group into a bare reference that gets appended
        # after translation.
        if match.start() >= 2 and text[match.start() - 1] == "," and text[match.start() - 2].isdigit():
            continue
        prefix = text[:match.start()]
        word = re.search(r"([A-Za-z]+)$", prefix)
        if word and word.group(1).lower() in _BARE_REFERENCE_IDENTIFIER_WORDS:
            continue
        matches.append(match)
    return matches


def bare_reference_values(text: str) -> set[str]:
    """Return high-confidence bare superscript markers in *text*.

    These markers are kept literal by the engine because placeholder tokens
    are more likely to be dropped when a sentence contains many inline
    references. The client invariant gate still requires every value to
    survive unchanged.
    """
    return {match.group(0) for match in _bare_reference_matches(text)}


def restore_missing_bare_references(source: str, output: str) -> str:
    """Restore source-derived bare markers omitted by the decoder.

    Bare PDF superscripts are intentionally left literal because placeholder
    tokens are unstable in citation-heavy units. If decoding still omits one,
    append the exact missing marker(s) immediately before the unit's terminal
    punctuation. This preserves the scientific invariant without inventing a
    number or silently accepting a loss; the placement remains within the
    same translation unit and is recorded by the client invariant gate.
    """
    required = [match.group(0) for match in _bare_reference_matches(source)]
    if not required:
        return output
    remaining = list(required)
    for match in re.finditer(r"(?<!\d)\d{1,3}(?!\d)", output):
        value = match.group(0)
        if value in remaining:
            remaining.remove(value)
    if not remaining:
        return output
    suffix = " " + ",".join(remaining)
    terminal = re.search(r"([。！？.!?])\s*$", output)
    if terminal:
        return f"{output[:terminal.start()]}{suffix}{output[terminal.start():]}"
    return f"{output}{suffix}"

# Parenthetical author-year references are a single citation fact even when
# they contain several authors separated by semicolons.  Keeping the entire
# group atomic preserves years and names during decoding; the segmenter already
# uses delimiter depth to ensure it never splits inside the same group.
AUTHOR_YEAR_CITATION_RE = re.compile(
    r"\("
    r"(?=[^()]{0,360}\b(?:18|19|20)\d{2}[a-z]?\b)"
    r"(?=[^()]{0,360}\b[A-Z][A-Za-z'’-]+)"
    r"[^()]*"
    r"\)"
)

# Narrative author-year citations (including possessives) appear outside
# parentheses: `Kelly’s (2016)` and `Marquardt et al. (2011)`. Protect the
# author token together with its year so transliteration/decoding cannot alter
# a cited scholar's name while leaving the year intact.
NARRATIVE_AUTHOR_YEAR_CITATION_RE = re.compile(
    r"\b"
    r"(?:[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+|(?!(?:what|when|where|who|whom|which|this|that|with|then|than|into|upon|also)\b)[a-z]{1,4}\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+)"
    # Include given/middle names before the family name. Protecting only the
    # final surname/year allowed alternate decoders to translate or replace a
    # cited author's given name (for example, Geoff -> George Thompson).
    r"(?:\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+){0,2}"
    r"(?:\s+et\s+al\.?)?"
    r"(?:\s+(?:and|&)\s+(?:[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+|[a-z]{1,4}\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+))?"
    r"(?:['’]s)?\s*"
    r"\(\s*(?:18|19|20)\d{2}[a-z]?\s*\)"
)

# Publisher PDFs frequently render a numeric footnote citation directly after
# ``et al.`` without brackets or parentheses (for example ``Ruggeri et al.18``).
# Keep the author token and marker atomic; matching the explicit ``et al.``
# shape avoids treating ordinary alphanumeric identifiers as citations.
AUTHOR_ET_AL_SUPERSCRIPT_RE = re.compile(
    r"\b[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+\s+et\s+al\.\s*\d{1,3}\b"
)

# ``SI Appendix`` is a conventional supplementary-material label. Preserve the
# complete label so a decoder cannot silently turn a cross-reference into
# ordinary prose or drop it during semantic rescue segmentation.
SUPPLEMENTARY_APPENDIX_RE = re.compile(r"\bSI\s+Appendix\b")

# Inline footnote plus supplementary-material pointer (``17 (Hospital, see SI
# Appendix)``) is one cross-reference unit. Keeping its pieces separate makes
# MADLAD drop one placeholder even when the sentence is otherwise translated.
SUPPLEMENTARY_CITATION_GROUP_RE = re.compile(
    r"\b\d{1,3}\s*\([^()]{0,180}\bSI\s+Appendix\b[^()]{0,180}\)",
    re.IGNORECASE,
)

# Cross-references to numbered sections/appendices are scientific structure,
# not prose. Keeping the label and its number atomic prevents a decoder from
# dropping the reference while translating a long multi-clause paragraph.
SECTION_CROSS_REFERENCE_RE = re.compile(
    r"\b(?:Section|Appendix)\s+(?:\d+(?:\.\d+)*|[A-Z])\b",
    re.IGNORECASE,
)

# Keep a figure/table label and its optional subpanel together. Treating
# `Figure 2` and `(a)` as separate placeholders makes long paragraphs prone to
# partial restoration failure; the complete structural reference is atomic.
FIGURE_TABLE_CROSS_REFERENCE_RE = re.compile(
    r"\b(?:Figure|Fig\.|Table|Tbl\.)\s+\d+(?:\s*\([A-Za-z]\))?(?![A-Za-z0-9])",
    re.IGNORECASE,
)

# Names in explicit acknowledgment lists are factual entities, not translation
# targets. Capture only a list of at least three two-token proper names after
# a clear thank/acknowledge verb; ordinary title-cased prose is not protected.
_ACK_NAME = r"[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+(?:\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+){1,2}"
ACKNOWLEDGMENT_NAME_LIST_RE = re.compile(
    r"\b(?:[Tt]he\s+author|[Ww]e|I)\s+(?:would\s+like\s+to\s+)?(?:thanks?|acknowledges?)\s+"
    r"(?P<names>" + _ACK_NAME + r"(?:,\s+" + _ACK_NAME + r"){1,}(?:,\s+(?:and\s+)?" + _ACK_NAME + r")?)"
)

# A parenthetical that contains a figure reference or an explicit statistical
# result is a compact evidence statement, not ordinary explanatory prose.
# Keeping the *whole* parenthetical atomic retains the test name, separator
# punctuation, figure panel, and values as one relationship. This is generic
# to result reporting and avoids rebuilding a sentence from individually
# restored placeholders such as `tDCSFig. 7bU=307`.
SCIENTIFIC_PARENTHETICAL_RE = re.compile(
    r"\("
    r"(?=[^()]{0,240}(?:\bfig(?:ure)?s?\.?\s*\d+(?:[a-z]|\([a-z]\))?|\bp\s*(?:=|<|>|≤|≥)\s*\.?\d|(?-i:\b[UWHV]\s*=)|(?:[χΧxX](?:²|2)?|[FfTtZz])\s*\(|\b[A-Za-z]\s*(?:\u0338\s*=|!=|≠|=|<|>|≤|≥)\s*[-+]?\d|\b0?\.\d+\b))"
    r"[^()]{1,240}"
    r"\)",
    re.IGNORECASE,
)

# Ordered from most structured to least structured.  These tokens carry facts
# rather than prose; translating them is both unnecessary and a frequent
# source of fluent-looking scientific errors.
SCIENTIFIC_TOKEN_RE = re.compile(
    r"(?:"
    # Standalone figure-panel labels are structure, not translatable prose.
    # Protect labels when followed by a caption so the caption still reaches
    # the model and the exact source marker can be restored afterward.
    r"\([a-z]\)(?=\s|[,;:]|$)"
    r"|"
    r"\b10\.\d{4,9}/[-._;()/:A-Z0-9]+"  # DOI
    r"|https?://[^\s)>\]}]+"  # URL
    # Keep numbered table cross-references atomic. A decoder may translate
    # the label while dropping the number, or preserve a generic number in an
    # unrelated clause and falsely appear to have retained the reference.
    r"|\btable\s+\d+(?:[a-z]|\([a-z]\))?"  # table/panel reference
    r"|\b(?:fig(?:ure)?s?\.?\s*\d+(?:[a-z]|\([a-z]\))?)"  # figure/panel reference
    r"|(?:[χΧxX](?:²|2)?|[FfTtZz])\s*\([^)]{1,16}\)\s*(?:=|<|>|≤|≥)\s*[-+]?\d+(?:\.\d+)?"  # test statistic
    # Rank/non-parametric tests commonly report a bare uppercase statistic
    # (`U=307`, `W=...`, `H=...`, `V=...`) with no degrees-of-freedom
    # parentheses. Restrict this to uppercase symbols so ordinary variable
    # prose is not over-protected.
    r"|(?-i:\b[UWHV]\s*=\s*[-+]?\d+(?:\.\d+)?)"
    r"|\bp\s*(?:=|<|>|≤|≥)\s*\.?\d+(?:\.\d+)?"  # p-value
    r"|\b[A-Za-z]\s*(?:\u0338\s*=|!=|≠|=|<|>|≤|≥)\s*[-+]?\d+(?:\.\d+)?"  # variable comparison
    r"|\bn\s*=\s*\d+"  # sample size
    # Participant/condition labels such as `(P4)` are source structure.
    # Keep the delimiters atomic with the identifier so quoted observations do
    # not fail closed when a decoder drops the marker.
    r"|\([A-Z]{1,4}\d{1,3}\)"
    r"|\(\s*0?\.\d+(?:\s*,\s*0?\.\d+)*\s*\)"  # compact reported p-value/effect-size decimals
    r"|\b\d+(?:\.\d+)?\s*°\s*[CF]\s*\(\s*\d+(?:\.\d+)?\s*°\s*[CF]\s*\)"  # paired Celsius/Fahrenheit value
    r"|\b\d+(?:\.\d+)?\s*°\s*[CF]\b"  # Celsius/Fahrenheit temperatures
    # Math-font SI symbols are common in native PDF text (for example
    # ``1.49𝑚𝑚``). Keep them atomic just like their ASCII equivalents;
    # otherwise MADLAD may turn the unit into unrelated kana/Latin glyphs.
    r"|(?<!\w)(?:≤|≥|<|>|±)?[ \t]*\d+(?:\.\d+)?[ \t]*(?:mAh|MHz|GHz|kHz|Hz|mm|cm|km|ms|kg|mg|pF|nF|uF|μF|mF|uW|mW|kW|W|mV|kV|V|mA|kA|A|dB|Ω|kΩ|MΩ|m|s|%|𝑚𝑚|𝑚)\b"  # measurement
    # Technical/model identifiers such as DeepIV. A terminal run of capitals
    # is a strong identifier signal; protecting every mixed-case product name
    # can move it to the end of a Japanese sentence during greedy decoding.
    # Other mixed-case names are still checked by the post-decode invariant.
    # The enclosing expression is IGNORECASE for units/statistics, so turn it
    # off only for this pattern: an actual lower-to-upper transition is what
    # distinguishes a technical identifier from ordinary English prose.
    r"|(?-i:\b[A-Za-z]*[a-z][A-Z]{2,}[A-Za-z0-9]*\b)"
    # Mixed-case technical names (for example iPhone, eHealth, or M2W) are
    # facts even when the capital run is only one letter.  Preserve the
    # transition generically rather than maintaining a paper-specific list.
    r"|(?-i:\b[A-Za-z]+[a-z][A-Z][A-Za-z0-9]*\b)"
    # Alphanumeric method identifiers (M2W, TQP3M9009) are facts even when
    # they do not contain a lowercase-to-uppercase transition.
    r"|(?-i:\b[A-Z]{1,4}\d[A-Z0-9]{1,12}\b)"
    # Native extraction may concatenate an all-caps organization/method name
    # with a superscript reference, e.g. ``UNESCO6``. Protect the complete
    # alphanumeric token so the model cannot localize the acronym and make the
    # source invariant appear lost (or detach the reference number).
    r"|(?-i:\b[A-Z]{2,10}\d{1,3}\b)"
    r"|(?-i:\b[A-Z]{2,8}\b)"
    # Hyphenated Title-Case system/method names (Power-over-Skin, Machine-to-
    # Wearable) are identifiers, not ordinary prose. Preserve them exactly so
    # the model cannot silently replace the named contribution with a generic
    # description.
    r"|(?-i:\b[A-Z][a-z]+(?:-[a-z]+)*-[A-Z][a-z]+\b)"
    r")",
    re.IGNORECASE,
)

# Empirically, MADLAD-400 3B greedy decode often copies ZZCIT1ZZ / ZZCIT2ZZ
# in academic sentences (measured on the citation corpus). ZZCIT0ZZ was dropped
# in the same van Dijk sentence, so indices are 1-based.
_PLACEHOLDER_PREFIX = "ZZCIT"
_PLACEHOLDER_SUFFIX = "ZZ"


def placeholder_for(index: int, nonce: int = 0) -> str:
    n = index + 1
    if nonce:
        return f"{_PLACEHOLDER_PREFIX}{nonce}X{n}{_PLACEHOLDER_SUFFIX}"
    return f"{_PLACEHOLDER_PREFIX}{n}{_PLACEHOLDER_SUFFIX}"


def _placeholder_pattern(index: int, nonce: int) -> re.Pattern[str]:
    token = placeholder_for(index, nonce)
    return re.compile(re.escape(token), re.IGNORECASE)


def _terminal_nested_statistical_parentheticals(text: str) -> list[re.Match[str]]:
    """Find balanced terminal result groups containing nested test notation.

    The simpler regex cannot match shapes such as ``(H(2)=4.17, p=0.124)``.
    Protecting a complete terminal group lets the existing restore path retain
    test/value relationships when the model drops its placeholder. Nonterminal
    groups are excluded because restoring them at sentence end could attach
    results to a later coordinated claim.
    """
    matches: list[re.Match[str]] = []
    for start, char in enumerate(text):
        if char != "(":
            continue
        depth = 0
        end = -1
        for index in range(start, min(len(text), start + 421)):
            if text[index] == "(":
                depth += 1
            elif text[index] == ")":
                depth -= 1
                if depth == 0:
                    end = index + 1
                    break
        if end < 0 or end - start <= 2:
            continue
        if text[end:].strip().rstrip(".?!。！？").strip():
            continue
        value = text[start:end]
        statistic = re.search(
            r"(?:[χΧxX](?:²|2)?|[FfTtZz])\s*\([^()]{1,20}\)\s*(?:=|<|>|≤|≥)\s*[-+]?\d"
            r"|\bH\s*\(\s*\d+\s*\)\s*(?:=|<|>|≤|≥)\s*[-+]?\d"
            r"|(?-i:\b[UWHV])\s*=\s*[-+]?\d",
            value,
        )
        p_value = re.search(r"\bp\s*(?:=|<|>|≤|≥)\s*\.?\d", value, re.I)
        if statistic and p_value:
            match = re.compile(re.escape(value)).match(text, start, end)
            if match:
                matches.append(match)
    return matches


def _protected_matches(text: str) -> list[re.Match[str]]:
    matches = (
        list(CITATION_RE.finditer(text))
        + list(INLINE_FOOTNOTE_CITATION_RE.finditer(text))
        + list(INLINE_TERMINAL_FOOTNOTE_RE.finditer(text))
        + list(TERMINAL_SUPERSCRIPT_CITATION_RE.finditer(text))
        + list(INLINE_NUMERIC_CITATION_RE.finditer(text))
        + _bare_reference_matches(text)
        + list(NARRATIVE_AUTHOR_YEAR_CITATION_RE.finditer(text))
        + list(AUTHOR_ET_AL_SUPERSCRIPT_RE.finditer(text))
        + list(SUPPLEMENTARY_CITATION_GROUP_RE.finditer(text))
        + list(SUPPLEMENTARY_APPENDIX_RE.finditer(text))
        + list(FIGURE_TABLE_CROSS_REFERENCE_RE.finditer(text))
        + list(SECTION_CROSS_REFERENCE_RE.finditer(text))
        + [match for match in ACKNOWLEDGMENT_NAME_LIST_RE.finditer(text)]
        + list(AUTHOR_YEAR_CITATION_RE.finditer(text))
        + list(SCIENTIFIC_PARENTHETICAL_RE.finditer(text))
        + _terminal_nested_statistical_parentheticals(text)
        + list(IDENTIFIER_GROUP_RE.finditer(text))
        + list(SCIENTIFIC_TOKEN_RE.finditer(text))
        + _repeated_title_case_matches(text)
    )
    # Do not turn ordinary uppercase function words or the conventional
    # ``SI Appendix`` label into scientific placeholders. Other short
    # all-caps tokens are preserved as potentially meaningful method names.
    ordinary = {"ABC", "AND", "BUT", "FOR", "FROM", "IV", "NOT", "OLS", "SI", "THE", "THIS", "THAT", "WITH"}
    matches = [
        match for match in matches
        if not (match.group(0).isupper() and match.group(0) in ordinary)
        # Keep model/version identifiers such as GPT-3 atomic.  The generic
        # acronym matcher otherwise captures ``GPT`` before the ``-3`` and
        # sends a standalone placeholder that MADLAD frequently drops.
        and not (
            match.group(0).isupper()
            and re.match(r"[A-Z]{2,8}(?=\s*[-‐‑–—]\s*\d)", text[match.start():])
        )
    ]
    matches = [
        match for match in matches
        if not _is_example_parenthetical_identifier(text, match)
    ]
    # The acknowledgment expression wraps its names in a leading sentence
    # context. Protect only that name-list subspan, leaving the thanks clause
    # available for translation.
    scoped_matches: list[re.Match[str]] = []
    for match in matches:
        if match.re is ACKNOWLEDGMENT_NAME_LIST_RE:
            start, end = match.span("names")
            name_match = re.compile(re.escape(match.group("names"))).match(text, start, end)
            if name_match:
                scoped_matches.append(name_match)
        else:
            scoped_matches.append(match)
    matches = scoped_matches
    # Isolated all-caps words in ordinary prose (for example, ``this API``)
    # are usually readable nouns rather than opaque identifiers. The blanket
    # acronym rule can otherwise replace them with a placeholder that MADLAD
    # drops. Keep acronyms protected when repeated, parenthetical, or attached
    # to a digit; expose a one-off prose acronym to the model.
    acronym_counts: dict[str, int] = {}
    for token in re.findall(r"(?-i:\b[A-Z]{2,8}\b)", text):
        acronym_counts[token] = acronym_counts.get(token, 0) + 1
    filtered: list[re.Match[str]] = []
    for match in matches:
        value = match.group(0)
        if re.fullmatch(r"[A-Z]{2,8}", value):
            start, end = match.span()
            inside_parenthetical = text.rfind("(", 0, start) > text.rfind(")", 0, start)
            adjacent_digit = (start > 0 and text[start - 1].isdigit()) or (end < len(text) and text[end].isdigit())
            preceding = text[max(0, start - 18):start]
            ordinary_noun_context = bool(re.search(r"\b(?:a|an|the|this|that|public|available)\s+$", preceding, re.I))
            # Short parenthetical acronyms such as `(TRA)` and `(TPB)` are
            # usually readable framework labels. Placeholdering them creates
            # a high-risk drop point while adding little protection; leave
            # them literal unless they are repeated or attached to a number.
            if (inside_parenthetical and acronym_counts.get(value, 0) == 1
                    and not adjacent_digit):
                continue
            if (acronym_counts.get(value, 0) == 1 and not inside_parenthetical
                    and not adjacent_digit and ordinary_noun_context):
                continue
        filtered.append(match)
    matches = filtered
    matches.sort(key=lambda match: (match.start(), -(match.end() - match.start())))
    non_overlapping: list[re.Match[str]] = []
    end = -1
    for match in matches:
        if match.start() < end:
            continue
        non_overlapping.append(match)
        end = match.end()
    return non_overlapping


def terminal_superscript_indices(
    text: str,
    *,
    unprotected_values: set[str] | None = None,
) -> set[int]:
    """Return protected-span indexes that are safe to restore at sentence end.

    A missing ``.<sup>3</sup>`` marker is recoverable at the translated
    sentence's terminal punctuation. Other bare numeric spans (for example a
    superscript before an explanatory parenthesis) must still fail closed.
    Indexes follow the same order as ``protect_citations``.
    """
    unprotected_values = unprotected_values or set()
    matches = [
        match for match in _protected_matches(text)
        if match.group(0) not in unprotected_values
    ]
    return {
        index
        for index, match in enumerate(matches)
        if match.re is TERMINAL_SUPERSCRIPT_CITATION_RE
    }


def protected_span_mask(text: str) -> str:
    """Mask protected spans without changing offsets for boundary scanning.

    Scientific punctuation must not become a sentence boundary before the
    corresponding token can be safely placeholder-protected for MADLAD.
    """
    chars = list(text)
    for match in _protected_matches(text):
        # Bare superscript markers stay literal in the engine; leave their
        # digits visible so the segmenter can recognize `algorithm.23 Other`
        # as a sentence boundary.
        if match.re is INLINE_BARE_REFERENCE_RE:
            continue
        chars[match.start():match.end()] = "X" * (match.end() - match.start())
    return "".join(chars)


def protect_citations(
    text: str,
    *,
    unprotected_values: set[str] | None = None,
) -> tuple[str, list[str], int]:
    """Replace citations and scientific facts with placeholders.

    ``unprotected_values`` is used only for a narrow retry of a dropped,
    identifier-like span. Other citations and scientific invariants remain
    protected during that retry.

    The API name remains for compatibility with the engine and existing tests.
    """
    unprotected_values = unprotected_values or set()
    expose_inline_numeric = os.getenv("MADLAD_EXPOSE_INLINE_NUMERIC_CITATIONS", "").lower() in {"1", "true", "yes"}
    matches = []
    for match in _protected_matches(text):
        value = match.group(0)
        if value in unprotected_values:
            continue
        # Diagnostic-only arm: keep simple bracketed numeric citations visible
        # so the model can use their sentence context. The post-translation
        # invariant checker still verifies that the citation remains present.
        # Author-year groups, statistics, measurements, identifiers, and other
        # opaque facts remain protected. The flag is opt-in and does not alter
        # production defaults.
        if (
            expose_inline_numeric
            and match.re is CITATION_RE
            and re.fullmatch(
                r"\[\s*\d{1,3}(?:\s*[-–—]\s*\d{1,3})?"
                r"(?:\s*,\s*\d{1,3}(?:\s*[-–—]\s*\d{1,3})?)*\s*\]",
                value.strip(),
            )
        ):
            continue
        matches.append(match)
    if not matches:
        return text, [], 0

    citations = [m.group(0) for m in matches]
    nonce = 0
    while True:
        tokens = [placeholder_for(i, nonce) for i in range(len(citations))]
        if all(token not in text for token in tokens):
            break
        nonce += 1
        if nonce > 50:
            return text, [], 0

    out = text
    for i, match in enumerate(reversed(matches)):
        idx = len(matches) - 1 - i
        out = out[: match.start()] + placeholder_for(idx, nonce) + out[match.end() :]
    return out, citations, nonce


_QUOTED_EXAMPLE_RE = re.compile(
    r"\be\.g\.,?\s*([\u201c\"'][^\u201d\"']{3,}[\u201d\"'])",
    re.IGNORECASE,
)


def protect_quoted_examples(text: str) -> tuple[str, list[str], int]:
    """Keep substantive ``e.g.`` examples atomic while translating context.

    Examples are source content, not identifiers: exposing the whole phrase
    to a small model can cause it to omit one example during clause rescue.
    Only the quoted span is masked, leaving ``e.g.`` and the surrounding
    grammar visible.  The exact source span is restored after decoding.
    """
    matches = list(_QUOTED_EXAMPLE_RE.finditer(text))
    if not matches:
        return text, [], 0
    nonce = 0
    while True:
        tokens = [f"ZZQTE{i}N{nonce}ZZ" for i in range(len(matches))]
        if all(token not in text for token in tokens):
            break
        nonce += 1
    out = text
    values = [match.group(1) for match in matches]
    for i, match in reversed(list(enumerate(matches))):
        out = out[: match.start(1)] + f"ZZQTE{i}N{nonce}ZZ" + out[match.end(1) :]
    return out, values, nonce


def restore_quoted_examples(text: str, values: list[str], nonce: int) -> str:
    for i, value in enumerate(values):
        token = f"ZZQTE{i}N{nonce}ZZ"
        if token not in text:
            raise ValueError(f"quoted example placeholder dropped by model: {value}")
        text = text.replace(token, value)
    return text


def _to_halfwidth(text: str) -> str:
    """MADLAD often emits fullwidth Latin (ＺＺＣＩＴ１ＺＺ). Restore ASCII first."""
    out: list[str] = []
    for ch in text:
        code = ord(ch)
        if 0xFF01 <= code <= 0xFF5E:
            out.append(chr(code - 0xFEE0))
        elif code == 0x3000:
            out.append(" ")
        else:
            out.append(ch)
    return "".join(out)


def _normalize_placeholder_glyphs(text: str) -> str:
    """Fold common Latin lookalikes only inside citation placeholders."""
    text = _to_halfwidth(text)
    text = re.sub(
        rf"{_PLACEHOLDER_PREFIX[0:3]}[IΙІ]T",
        _PLACEHOLDER_PREFIX,
        text,
        flags=re.IGNORECASE,
    )
    # MADLAD can drop the leading `ZZ` while retaining a source footnote
    # immediately before the placeholder (`15CIT2ZZ`). Recover only the
    # unmistakable CIT/index/ZZ suffix when it is directly preceded by a
    # digit; the digit itself remains source text and is restored separately.
    text = re.sub(
        rf"(?<=\d)CIT(\d+(?:X\d+)?)({re.escape(_PLACEHOLDER_SUFFIX)})",
        rf"{_PLACEHOLDER_PREFIX}\1\2",
        text,
        flags=re.IGNORECASE,
    )
    # Greedy decoding can emit Greek/Cyrillic lookalikes for the fixed ASCII
    # placeholder (for example ``ΖZCIΤ2ZZ``). Normalize only the complete
    # placeholder-shaped token; ordinary scientific text is untouched.
    # MADLAD occasionally repeats a Z-like glyph at the placeholder prefix
    # (for example `ZzZCIt1ZZ`). Normalize the whole span by its unique
    # placeholder index; translating glyphs in place would leave the extra Z
    # attached to the restored scientific identifier (`ZtDCS`).
    lookalikes = re.compile(
        r"[ZΖЗzζз]{2,4}[CСϹЦcсϲц][IΙІі][TΤТЦтц]"
        r"\d+(?:X\d+)?[ZΖЗzζз]{2,4}",
        re.IGNORECASE,
    )
    table = str.maketrans({"Ζ": "Z", "З": "Z", "С": "C", "Ϲ": "C", "Ц": "C", "ц": "c", "Ι": "I", "І": "I", "Τ": "T", "Т": "T", "ζ": "z", "с": "c", "ι": "i", "і": "i", "τ": "t", "т": "t"})

    def canonicalize(match: re.Match[str]) -> str:
        normalized = match.group(0).translate(table)
        identifier = re.search(r"\d+(?:X\d+)?", normalized, re.IGNORECASE)
        return f"{_PLACEHOLDER_PREFIX}{identifier.group(0)}{_PLACEHOLDER_SUFFIX}" if identifier else match.group(0)

    return lookalikes.sub(canonicalize, text)


def _is_inline_numeric_citation(value: str) -> bool:
    return bool(
        re.fullmatch(
            r"\s*\d{1,3}(?:\s*[-–—]\s*\d{1,3})?"
            r"(?:\s*,\s*\d{1,3}(?:\s*[-–—]\s*\d{1,3})?)+\s*",
            value,
        )
    )


def _is_measurement_value(value: str) -> bool:
    """Return whether a protected fact is a scalar measurement.

    Japanese decoders commonly attach the unit to the number (`1 pF` ->
    `1pF`). Such output still preserves the fact and can be restored exactly
    without treating a dropped placeholder as a safe omission.
    """
    return bool(re.fullmatch(
        r"\s*\d+(?:\.\d+)?\s*(?:mm|cm|m|km|ms|s|Hz|kHz|MHz|GHz|kg|mg|pF|nF|uF|μF|mF|mAh|dB|%)\s*",
        value,
        re.IGNORECASE,
    ))


def restore_citations(
    text: str,
    citations: list[str],
    nonce: int = 0,
    *,
    reject_missing: bool = False,
    recoverable_terminal_indices: set[int] | None = None,
) -> str:
    """Put original citation strings back, preserving content and order."""
    if not citations:
        return _to_halfwidth(text)
    out = _normalize_placeholder_glyphs(text)
    missing: list[str] = []
    recoverable_terminal_indices = recoverable_terminal_indices or set()
    for i, citation in enumerate(citations):
        # Restoring an earlier placeholder can expose a digit immediately
        # before a later merged token (`15CIT2ZZ`). Re-run the narrowly scoped
        # glyph normalizer at each step so adjacent placeholders are handled
        # deterministically in their source order.
        out = _normalize_placeholder_glyphs(out)
        pattern = _placeholder_pattern(i, nonce)
        if reject_missing and not pattern.search(out):
            # MADLAD sometimes inserts a Japanese/Latin glyph inside an
            # otherwise recognizable placeholder (for example ZZCイT4ZZ or
            # ZZCaT3ZZ). When the index is unambiguous, restore the exact
            # source fact by its placeholder index instead of exposing the
            # damaged marker or rejecting a recoverable translation.
            numbered = (
                rf"{re.escape(_PLACEHOLDER_PREFIX[:3])}[^\s]{{0,3}}"
                rf"{nonce}X{i + 1}{re.escape(_PLACEHOLDER_SUFFIX)}"
                if nonce
                else rf"{re.escape(_PLACEHOLDER_PREFIX[:3])}[^\s]{{0,3}}T{i + 1}{re.escape(_PLACEHOLDER_SUFFIX)}"
            )
            candidates = list(re.finditer(numbered, out, re.IGNORECASE))
            # When two placeholders are adjacent, MADLAD can merge the
            # suffix/prefix Z glyphs and emit the second token as `ZCIT2ZZ`
            # (or with a lookalike glyph). Accept only the expected index and
            # a short Z-prefixed token; this cannot match ordinary prose.
            if not candidates:
                adjacent = (
                    rf"Z{{1,4}}[^\s]{{0,3}}{nonce}X{i + 1}{re.escape(_PLACEHOLDER_SUFFIX)}"
                    if nonce
                    else rf"Z{{3,6}}[A-Za-zΙІіСсЦцΤТтц]{{0,3}}T{i + 1}{re.escape(_PLACEHOLDER_SUFFIX)}"
                )
                candidates = list(re.finditer(adjacent, out, re.IGNORECASE))
            if not candidates and not nonce:
                # A decoder may collapse the shared boundary completely,
                # yielding `ZZCIT1ZZCIT2ZZ`. The expected index and the
                # preceding canonical suffix make this unambiguous.
                candidates = list(re.finditer(
                    rf"(?<=ZZ)CIT{i + 1}{re.escape(_PLACEHOLDER_SUFFIX)}",
                    out,
                    re.IGNORECASE,
                ))
            if len(candidates) == 1:
                candidate = candidates[0]
                out = out[:candidate.start()] + placeholder_for(i, nonce) + out[candidate.end():]
        if pattern.search(out):
            # Native-PDF superscript references are attached to the preceding
            # term (for example ``“hospital problem”17``).  Greedy decoding
            # sometimes emits their placeholder after a Japanese full stop.
            # Keep this source fact attached to the translated term rather
            # than producing the malformed ``。17。`` / ``。17また`` sequence.
            if citation.isdigit():
                match = pattern.search(out)
                assert match is not None
                before, after = out[:match.start()], out[match.end():]
                terminal = re.search(r"([。！？])\s*$", before)
                if terminal:
                    punctuation = terminal.group(1)
                    if after.startswith(punctuation):
                        after = after[len(punctuation):]
                    out = before[:terminal.start()] + match.group(0) + punctuation + after
            out = pattern.sub(citation, out, count=1)
        elif citation not in out:
            # A measurement placeholder may be copied by the model as a
            # compact unit (`1pF`) rather than as the exact source spacing
            # (`1 pF`). Recognize only the tightly scoped scalar-unit form and
            # restore the canonical source spelling in place.
            if _is_measurement_value(citation):
                measurement = re.fullmatch(
                    r"\s*(\d+(?:\.\d+)?)\s*([A-Za-zμ]+|%)\s*",
                    citation,
                )
                if measurement:
                    compact = re.compile(
                        rf"(?<![A-Za-z0-9]){re.escape(measurement.group(1))}"
                        rf"\s*{re.escape(measurement.group(2))}(?![A-Za-z0-9])",
                        re.IGNORECASE,
                    )
                    if compact.search(out):
                        out = compact.sub(citation, out, count=1)
                        continue
            if (
                reject_missing
                and i in recoverable_terminal_indices
                and citation.isdigit()
                and (terminal := re.search(r"([。！？.!?])\s*$", out))
            ):
                # The source matcher established this was a terminal
                # superscript reference, so it can be restored adjacent to the
                # translated sentence mark without guessing among prose digits.
                out = out[:terminal.start()] + citation + terminal.group(1) + out[terminal.end():]
                continue
            # A dropped parenthetical/figure citation at the source sentence
            # tail can be restored exactly before the translated terminal mark.
            # This is deliberately limited to reference-shaped spans; numeric
            # measurements and identifiers must still fail closed when lost.
            if (
                citation.lstrip().startswith(("(", "["))
                or _is_inline_numeric_citation(citation)
            ) and re.search(r"[。！？.!?]\s*$", out):
                terminal = re.search(r"([。！？.!?])\s*$", out)
                assert terminal is not None
                out = out[:terminal.start()] + citation.strip() + terminal.group(1) + out[terminal.end():]
            else:
                missing.append(citation)
    leftover = (
        re.compile(rf"{re.escape(_PLACEHOLDER_PREFIX)}\d+X\d+{re.escape(_PLACEHOLDER_SUFFIX)}", re.I)
        if nonce
        else re.compile(rf"{re.escape(_PLACEHOLDER_PREFIX)}\d+{re.escape(_PLACEHOLDER_SUFFIX)}", re.I)
    )
    # Greedy decoding can insert or substitute glyphs inside a protected token
    # (for example ``ZZtCIT4ZZ``). Such residue is not recoverable safely and
    # must fail closed instead of reaching the reader as visible garbage.
    malformed = re.compile(r"ZZ[^\s]{1,12}(?=[^\s]{0,12}\d)(?=[^\s]{0,12}(?:C|I|T))[^\s]{1,12}ZZ", re.IGNORECASE)
    if reject_missing and malformed.search(out):
        raise ValueError("protected citation placeholder malformed")
    if reject_missing and missing:
        raise ValueError(
            # Use a separator that cannot be confused with commas inside a
            # numeric citation such as `[8, 18, 20]`; the rescue path parses
            # this diagnostic to expose only safe identifier spans.
            "protected citation placeholder dropped by model: "
            + " || ".join(missing[:4])
        )
    out = leftover.sub("", out)
    for citation in missing:
        # If MADLAD drops an inline numeric-reference placeholder entirely,
        # restore it before the Japanese terminal mark.  Appending it after
        # the sentence creates a detached citation and makes the following
        # joined unit look like ``17また``.
        terminal = re.search(r"([。！？])\s*$", out) if citation.isdigit() else None
        if terminal:
            out = out[:terminal.start()] + citation + terminal.group(1) + out[terminal.end():]
        else:
            out = out.rstrip() + citation
    return out
