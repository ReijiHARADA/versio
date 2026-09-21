"""Protect scientific invariants around MADLAD generate / restore after.

Placeholders are ASCII tokens chosen so greedy MADLAD decoding tends to copy
them rather than translate or drop them. Measured against the fixed
benchmarks/corpus.json citation case (see tests/test_citation_protect.py and
scripts/bench_citation_protect.py).
"""

from __future__ import annotations

import re

# Bump this whenever source-fact protection rules change. It participates in
# the server translation/cache identity so old accepts are not reused silently.
SOURCE_PROTECTION_VERSION = "source-protect-v13"

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
}


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
    r"|\(\s*0?\.\d+(?:\s*,\s*0?\.\d+)*\s*\)"  # compact reported p-value/effect-size decimals
    r"|\b\d+(?:\.\d+)?\s*°\s*[CF]\s*\(\s*\d+(?:\.\d+)?\s*°\s*[CF]\s*\)"  # paired Celsius/Fahrenheit value
    r"|\b\d+(?:\.\d+)?\s*°\s*[CF]\b"  # Celsius/Fahrenheit temperatures
    r"|\b\d+(?:\.\d+)?\s*(?:mm|cm|m|km|ms|s|Hz|kHz|MHz|GHz|kg|mg|pF|nF|uF|μF|mF|mAh|dB|%)\b"  # measurement
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
        + list(TERMINAL_SUPERSCRIPT_CITATION_RE.finditer(text))
        + list(INLINE_NUMERIC_CITATION_RE.finditer(text))
        + list(NARRATIVE_AUTHOR_YEAR_CITATION_RE.finditer(text))
        + [match for match in ACKNOWLEDGMENT_NAME_LIST_RE.finditer(text)]
        + list(AUTHOR_YEAR_CITATION_RE.finditer(text))
        + list(SCIENTIFIC_PARENTHETICAL_RE.finditer(text))
        + _terminal_nested_statistical_parentheticals(text)
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
    matches = [
        match for match in _protected_matches(text)
        if match.group(0) not in unprotected_values
    ]
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
            "protected citation placeholder dropped by model: "
            + ", ".join(missing[:4])
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
