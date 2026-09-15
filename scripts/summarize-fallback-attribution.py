#!/usr/bin/env python3
"""Create a compact, reproducible summary of the fallback attribution report."""
from __future__ import annotations
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "test-data/real-papers/reports/translation-fallback-attribution.json"
CURRENT_REPORT = ROOT / "test-data/real-papers/reports/translation-audit.json"
OUTPUT = ROOT / "test-data/real-papers/reports/translation-fallback-attribution-summary-v77.json"
REVIEWS = ROOT / "test-data/real-papers/audit-manual-review.json"

def main() -> None:
    failures = json.loads(SOURCE.read_text(encoding="utf-8"))["failures"]
    # Attribution is deliberately persisted separately from benchmark output,
    # but a block can become healthy after a pipeline change.  Do not keep
    # counting such historical rows in the current product summary.
    current = json.loads(CURRENT_REPORT.read_text(encoding="utf-8"))
    papers_by_id = {
        paper["paper"]["id"]: paper["paper"]
        for paper in current.get("papers", [])
        if paper.get("paper", {}).get("id")
    }
    current_ids = {
        (paper["paper"]["id"], row["blockId"])
        for paper in current.get("papers", [])
        for row in paper.get("rows", [])
        if row.get("sourceCategory") == "ordinary-body-prose"
        and (row.get("readerVisibleFallback") or row.get("sourceFallback"))
    }
    failures = [
        row for row in failures if (row["paperId"], row["blockId"]) in current_ids
    ]
    causes = Counter(row["attribution"]["primary"] for row in failures)
    # Older inventories stored an object (`{"status": ...}`); the current
    # reconciled inventory uses the simpler status string. Accept both so the
    # summary remains reproducible across audit schema revisions.
    def integrity_status(row: dict) -> str:
        value = row.get("sourceIntegrity", "unknown")
        if isinstance(value, dict):
            return str(value.get("status", "unknown"))
        return str(value)

    integrity = Counter(integrity_status(row) for row in failures)
    reasons = Counter(row["fallbackReason"] for row in failures)
    fallback_stages = Counter(str(row.get("fallbackStage", "unknown")) for row in failures)
    ordinary_rows = [
        (paper["paper"], row)
        for paper in current.get("papers", [])
        for row in paper.get("rows", [])
        if row.get("sourceCategory") == "ordinary-body-prose"
    ]
    fallback_keys = {(row["paperId"], row["blockId"]) for row in failures}

    def grouped_metrics(key: str) -> dict:
        groups: dict[str, dict[str, int]] = {}
        for paper, row in ordinary_rows:
            group = str(paper.get(key) or "unknown")
            item = groups.setdefault(group, {"ordinaryRows": 0, "fallbacks": 0})
            item["ordinaryRows"] += 1
            if (paper["id"], row["blockId"]) in fallback_keys:
                item["fallbacks"] += 1
        for item in groups.values():
            item["rate"] = item["fallbacks"] / max(1, item["ordinaryRows"])
        return dict(sorted(groups.items()))

    # Manual-review records are the canonical discipline annotation currently
    # available; use the majority label per paper when the paper catalog lacks
    # an explicit field.
    review_payload = json.loads(REVIEWS.read_text(encoding="utf-8"))
    discipline_votes: dict[str, Counter[str]] = {}
    for review in review_payload.get("reviews", []):
        paper_id = review.get("paperId")
        labels = review.get("disciplines") or []
        if paper_id and labels:
            votes = discipline_votes.setdefault(str(paper_id), Counter())
            votes.update(str(label) for label in labels)
    discipline_map = {
        paper_id: votes.most_common(1)[0][0]
        for paper_id, votes in discipline_votes.items()
        if votes
    }

    def discipline_for(paper: dict) -> str:
        # The catalog uses `discipline`; retain format-family fallback for older
        # rows so the grouping never silently drops a paper.
        return str(paper.get("discipline") or paper.get("domain") or discipline_map.get(paper.get("id"), "unknown"))

    discipline_groups: dict[str, dict[str, int]] = {}
    for paper, row in ordinary_rows:
        group = discipline_for(paper)
        item = discipline_groups.setdefault(group, {"ordinaryRows": 0, "fallbacks": 0})
        item["ordinaryRows"] += 1
        if (paper["id"], row["blockId"]) in fallback_keys:
            item["fallbacks"] += 1
    for item in discipline_groups.values():
        item["rate"] = item["fallbacks"] / max(1, item["ordinaryRows"])
    # Include completed archived records so regenerating the current-key queue
    # cannot erase historical manual-review evidence from the safety metric.
    active_reviews = review_payload.get("reviews", [])
    archived_reviews = review_payload.get("archivedReviews", [])
    review_by_key = {row.get("key"): row for row in archived_reviews if row.get("key")}
    review_by_key.update({row.get("key"): row for row in active_reviews if row.get("key")})
    reviews = list(review_by_key.values()) + [
        row for row in archived_reviews if not row.get("key")
    ]
    unsafe_false_accepts = sum(
        row.get("readerVisibleFallback") is False and int(row.get("severity", 0)) >= 2
        for row in reviews
    )
    reviewed_accepts = sum(
        row.get("readerVisibleFallback") is False for row in reviews
        if "readerVisibleFallback" in row
    )
    review_labels = Counter(
        label
        for row in reviews
        for label in (row.get("labels") or ["unlabeled"])
    )
    severity_counts = Counter(str(row.get("severity", "unrated")) for row in reviews)
    summary = {
        "sourceReport": str(SOURCE.relative_to(ROOT)),
        "failureCount": len(failures),
        "primaryCauseCounts": dict(sorted(causes.items())),
        "sourceIntegrityCounts": dict(sorted(integrity.items())),
        "fallbackReasonCounts": dict(sorted(reasons.items())),
        "fallbackStageCounts": dict(sorted(fallback_stages.items())),
        "manualReviewRequired": True,
        "manualReview": {
            "completed": sum(bool(row.get("reviewedAt")) for row in reviews),
            "pending": sum(not row.get("reviewedAt") for row in reviews),
            "unsafeFalseAcceptsSeverityGte2": unsafe_false_accepts,
            "reviewedAcceptedBlocks": reviewed_accepts,
            "unsafeFalseAcceptRate": unsafe_false_accepts / max(1, reviewed_accepts),
            "labelCounts": dict(sorted(review_labels.items())),
            "severityCounts": dict(sorted(severity_counts.items())),
        },
        "productMetric": {
            "ordinaryFallbacks": len(current_ids),
            "ordinaryRows": sum(
                1
                for paper in current.get("papers", [])
                for row in paper.get("rows", [])
                if row.get("sourceCategory") == "ordinary-body-prose"
            ),
            "rate": len(current_ids)
            / max(
                1,
                sum(
                    1
                    for paper in current.get("papers", [])
                    for row in paper.get("rows", [])
                    if row.get("sourceCategory") == "ordinary-body-prose"
                ),
            ),
        },
        "byDiscipline": dict(sorted(discipline_groups.items())),
        "byFormatFamily": grouped_metrics("formatFamily"),
    }
    OUTPUT.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(OUTPUT)
    print(json.dumps(summary, ensure_ascii=False))

if __name__ == "__main__":
    main()
