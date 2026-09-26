"""Diagnostic repeated-domain-term placeholder harness.

This module deliberately does not change production protection.  It provides
one generic candidate detector and an exact replacement/restore operation so
held-out experiments can measure whether repeated technical terms drift during
MADLAD decoding.
"""
from __future__ import annotations

import argparse
import json
import re
import math
from collections import Counter
from pathlib import Path

WORD_RE = re.compile(r"\b[A-Za-z][A-Za-z'-]{3,24}\b")
TERM_CONTEXT_RE = re.compile(
    r"\b(?:cue|memory|model|task|condition|effect|interaction|advertising|social|"
    r"experiment|method|measure|signal|data|behavior|behaviour|information|"
    r"defined|refers|means|called)\b",
    re.IGNORECASE,
)
# High-frequency prose words are poor terminology candidates.  The list is
# intentionally conservative: an ambiguous word remains unprotected and is
# reviewed rather than forcing English into Japanese output.
COMMON_PROSE = frozenset(
    "about after again against among another around because before being between both "
    "could during each either every from further have however into itself more most "
    "other over same should since some such than that their them then there these "
    "they this those through toward under until very was were which while with would "
    "also been being can does had has into may might must our own per research result "
    "results study studies using used use paper present present one two three four five "
    "participant participants information data factor factors effect effects method "
    "methods analysis analyses figure table shown found based different experimental "
    "external internal memory detailed resistance training cognitive clips cues half "
    "presented following"
    .split()
)


def repeated_domain_terms(source: str, *, minimum_count: int = 2) -> list[str]:
    """Return stable, lower-case repeated term candidates in source order."""
    words = WORD_RE.findall(source)
    counts = Counter(word.lower() for word in words)
    seen: set[str] = set()
    terms: list[str] = []
    for word in words:
        key = word.lower()
        # Keep title-case sentence starts out of this diagnostic arm. They
        # need occurrence-aware restoration; lower-case terms are stable
        # candidates for an exact round-trip experiment.
        if word != key or key in seen or key in COMMON_PROSE or counts[key] < minimum_count:
            continue
        seen.add(key)
        terms.append(word)
    return terms


def term_salience(source: str, corpus_sources: list[str]) -> dict[str, float]:
    """Score repeated candidates with corpus-level inverse document frequency."""
    local = Counter(word.lower() for word in WORD_RE.findall(source))
    docs = max(1, len(corpus_sources))
    document_frequency = Counter(
        term for corpus_source in corpus_sources
        for term in set(word.lower() for word in WORD_RE.findall(corpus_source))
    )
    scores: dict[str, float] = {}
    for term in repeated_domain_terms(source):
        if term in COMMON_PROSE:
            continue
        idf = math.log((docs + 1) / (document_frequency[term] + 1))
        scores[term] = round(local[term] * idf, 4)
    return scores


def term_evidence(source: str, corpus_sources: list[str]) -> dict[str, dict[str, float]]:
    """Return salience plus generic local context evidence for review."""
    scores = term_salience(source, corpus_sources)
    evidence: dict[str, dict[str, float]] = {}
    for term, score in scores.items():
        contexts = 0
        for match in re.finditer(rf"\b{re.escape(term)}\b", source):
            window = source[max(0, match.start() - 55):match.end() + 55]
            contexts += int(bool(TERM_CONTEXT_RE.search(window)))
        evidence[term] = {"salience": score, "contextHits": contexts,
                          "combined": round(score + contexts * 2.0, 4)}
    return evidence


def protect_repeated_terms(source: str, terms: list[str] | None = None) -> tuple[str, dict[str, str]]:
    """Replace candidates with opaque, numbered markers and return a map."""
    selected = terms if terms is not None else repeated_domain_terms(source)
    mapping = {f"ZZTERM{i}ZZ": term for i, term in enumerate(selected, 1)}
    protected = source
    for marker, term in mapping.items():
        # Candidates are lower-case by construction; case-sensitive matching
        # prevents a repeated lower-case term from rewriting a sentence-initial
        # title-case word and breaking the round-trip invariant.
        protected = re.sub(rf"\b{re.escape(term)}\b", marker, protected)
    return protected, mapping


def restore_repeated_terms(output: str, mapping: dict[str, str]) -> str:
    """Restore markers case-insensitively, tolerating decoder case drift."""
    restored = output
    for marker, term in mapping.items():
        restored = re.sub(re.escape(marker), term, restored, flags=re.IGNORECASE)
    return restored


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True, help="JSON list of strings or {id,source} records")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--group-by-parent", action="store_true", help="derive terms across records sharing text before '#unit-'")
    parser.add_argument("--corpus-report", type=Path, help="optional audit report used only for corpus-level term salience")
    parser.add_argument("--min-combined", type=float, default=0.0, help="optional diagnostic evidence threshold")
    args = parser.parse_args()
    records = json.loads(args.input.read_text(encoding="utf-8"))
    result = []
    group_terms: dict[str, list[str]] = {}
    group_sources: dict[str, str] = {}
    corpus_sources: list[str] = []
    if args.corpus_report:
        report = json.loads(args.corpus_report.read_text(encoding="utf-8"))
        corpus_sources = [str(row.get("source", "")) for paper in report.get("papers", []) for row in paper.get("rows", []) if row.get("source")]
    if args.group_by_parent:
        grouped: dict[str, list[str]] = {}
        for item in records:
            identifier = str(item.get("id", "")) if isinstance(item, dict) else ""
            parent = identifier.split("#unit-", 1)[0]
            grouped.setdefault(parent, []).append(str(item["source"]))
        group_terms = {parent: repeated_domain_terms(" ".join(sources)) for parent, sources in grouped.items()}
        group_sources = {parent: " ".join(sources) for parent, sources in grouped.items()}
    for index, item in enumerate(records):
        source = item if isinstance(item, str) else str(item["source"])
        identifier = str(item.get("id", index)) if isinstance(item, dict) else str(index)
        parent = identifier.split("#unit-", 1)[0]
        protected, mapping = protect_repeated_terms(source, group_terms.get(parent) if args.group_by_parent else None)
        evidence = term_evidence(group_sources.get(parent, source), corpus_sources) if corpus_sources else {}
        selected = [term for term, item_evidence in evidence.items() if item_evidence["combined"] >= args.min_combined]
        result.append({"id": identifier,
                       "source": source, "terms": list(mapping.values()),
                       "salience": term_salience(group_sources.get(parent, source), corpus_sources) if corpus_sources else {},
                       "evidence": evidence, "selectedTerms": selected,
                       "protected": protected,
                       "roundTrip": restore_repeated_terms(protected, mapping) == source})
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
