"""Selective identifier retry policy (torch-free for lightweight CI tests)."""

from __future__ import annotations

import re

MEASUREMENT_PATTERN = (
    r"(?<!\w)(?:[≤≥<>]=?|±)?[ \t]*\d+(?:\.\d+)?[ \t]*"
    r"(?:[kMGTmunpfμu]?\s*(?:mAh|MHz|GHz|kHz|Hz|mm|cm|km|ms|kg|mg|pF|nF|uF|μF|mF|uW|mW|kW|W|mV|kV|V|mA|kA|A|dB|Ω|kΩ|MΩ|m|s|%))\s*"
)


def _allowed_unprotected_retry_value(item: str) -> bool:
    """Allow fallback only for plain, non-camelcase identifier placeholders."""

    def is_plain_identifier(item: str) -> bool:
        return bool(re.fullmatch(r"\s*[A-Za-z][A-Za-z0-9._-]{1,31}\s*", item)) and not re.search(
            r"[a-z][A-Z]", item
        )

    def is_figure_or_table_reference(item: str) -> bool:
        return bool(
            re.fullmatch(
                r"\s*\(?\s*(?:fig(?:ure)?s?|table|tbl)\.?\s*\d+(?:\s*[a-z]|\s*\([a-z]\))?\s*\)?\s*",
                item,
                flags=re.IGNORECASE,
            )
        )

    def is_numeric_citation(item: str) -> bool:
        return bool(
            re.fullmatch(
                r"\s*\[\s*\d+(?:\s*[-–]\s*\d+|\s*,\s*\d+)*\s*\]\s*",
                item,
            )
        )

    def is_measurement(item: str) -> bool:
        return bool(re.fullmatch(MEASUREMENT_PATTERN, item, flags=re.IGNORECASE))

    def is_currency_identifier(item: str) -> bool:
        return bool(re.fullmatch(r"\s*(?:USD|EUR|GBP|JPY|CNY)\s*", item, flags=re.IGNORECASE))

    def is_supplementary_reference(item: str) -> bool:
        return bool(re.fullmatch(r"\s*SI\s+Appendix\s*", item, flags=re.IGNORECASE))

    def is_figure_table_reference(item: str) -> bool:
        return bool(
            re.fullmatch(
                r"\s*(?:Fig(?:ure)?\.?|Table|Tbl\.)\s+\d+(?:\s*\([A-Za-z]\)|[A-Za-z])?\s*",
                item,
                flags=re.IGNORECASE,
            )
        )

    def is_author_year_citation_group(item: str) -> bool:
        author = r"[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+(?:\s+et\s+al\.?)?(?:\s+(?:&|and)\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+)?"
        year = r"(?:\(\s*(?:18|19|20)\d{2}[a-z]?\s*\)|,?\s*(?:18|19|20)\d{2}[a-z]?)"
        entry = rf"(?:to\s+)?{author}\s*{year}"
        return bool(re.fullmatch(rf"\(?\s*{entry}(?:\s*;\s*{entry}){{0,3}}\s*\)?", item))

    def is_section_reference(item: str) -> bool:
        return bool(
            re.fullmatch(
                r"\s*(?:Section|Appendix)\s+(?:\d+(?:\.\d+)*|[A-Z])\s*",
                item,
                flags=re.IGNORECASE,
            )
        )

    def is_author_et_al_superscript(item: str) -> bool:
        return bool(
            re.fullmatch(
                r"\s*[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+\s+et\s+al\.\s*\d{1,3}\s*",
                item,
            )
        )

    return (
        is_plain_identifier(item)
        or is_figure_or_table_reference(item)
        or is_numeric_citation(item)
        or is_measurement(item)
        or is_currency_identifier(item)
        or is_supplementary_reference(item)
        or is_section_reference(item)
        or is_author_et_al_superscript(item)
    )


def unprotected_identifier_retry_values(
    missing: list[str], *, allow_inline_numeric: bool = False
) -> list[str]:
    """Return only spans safe to expose on a selective retry."""
    if not missing:
        return []

    def is_numeric_citation(item: str) -> bool:
        return bool(re.fullmatch(r"\s*\[\s*\d+(?:\s*[-–]\s*\d+|\s*,\s*\d+)*\s*\]\s*", item))

    def is_inline_numeric_citation(item: str) -> bool:
        return bool(re.fullmatch(r"\s*\d{1,3}\s*", item))

    def is_identifier(item: str) -> bool:
        return bool(re.fullmatch(r"\s*[A-Za-z][A-Za-z0-9._-]{1,31}\s*", item))

    def is_section_reference(item: str) -> bool:
        return bool(
            re.fullmatch(
                r"\s*(?:Section|Appendix)\s+(?:\d+(?:\.\d+)*|[A-Z])\s*",
                item,
                flags=re.IGNORECASE,
            )
        )

    def is_supplementary_reference(item: str) -> bool:
        return bool(re.fullmatch(r"\s*SI\s+Appendix\s*", item, flags=re.IGNORECASE))

    def is_figure_table_reference(item: str) -> bool:
        return bool(
            re.fullmatch(
                r"\s*(?:Fig(?:ure)?\.?|Table|Tbl\.)\s+\d+(?:\s*\([A-Za-z]\)|[A-Za-z])?\s*",
                item,
                flags=re.IGNORECASE,
            )
        )

    def is_author_year_citation_group(item: str) -> bool:
        author = r"[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+(?:\s+et\s+al\.?)?(?:\s+(?:&|and)\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+)?"
        year = r"(?:\(\s*(?:18|19|20)\d{2}[a-z]?\s*\)|,?\s*(?:18|19|20)\d{2}[a-z]?)"
        entry = rf"(?:to\s+)?{author}\s*{year}"
        return bool(re.fullmatch(rf"\(?\s*{entry}(?:\s*;\s*{entry}){{0,3}}\s*\)?", item))

    identifiers = [
        item
        for item in missing
        if is_identifier(item)
        or is_section_reference(item)
        or is_supplementary_reference(item)
        or is_figure_table_reference(item)
        or is_author_year_citation_group(item)
        or (allow_inline_numeric and is_inline_numeric_citation(item))
    ]
    if not identifiers:
        return []
    if not all(
        is_identifier(item)
        or is_section_reference(item)
        or is_supplementary_reference(item)
        or is_figure_table_reference(item)
        or is_author_year_citation_group(item)
        or is_numeric_citation(item)
        or is_inline_numeric_citation(item)
        for item in missing
    ):
        return []
    return identifiers


def allows_unprotected_identifier_retry(missing: list[str]) -> bool:
    """Backward-compatible predicate for callers and tests."""
    return bool(missing) and all(_allowed_unprotected_retry_value(item) for item in missing)
