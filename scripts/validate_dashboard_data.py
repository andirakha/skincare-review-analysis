#!/usr/bin/env python3
"""Check that a dashboard data folder has everything dashboard/script.js reads.

Run it after the notebook's export step (or after generate_demo_data.py):

    python scripts/validate_dashboard_data.py                      # notebooks/dashboard_data/
    python scripts/validate_dashboard_data.py path/to/folder

Exit code 0 = OK, 1 = problems found (listed on stderr).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

SENTIMENTS = {"Positive", "Neutral", "Negative"}

REVIEW_COLS = {"Product", "SkinType", "AgeGroup", "PostDate", "Review", "Rating", "Sentiment", "Recommended"}
PRODUCT_COLS = {
    "Product", "Review_Count", "Avg_Rating", "Pct_Positive", "Pct_Neutral",
    "Pct_Negative", "Weighted_Rating", "Eligible", "Rank",
}
STATS_KEYS = {
    "generated_at", "dataset", "ai_model", "total_reviews", "total_products", "avg_rating",
    "sentiment_counts", "rating_counts", "date_range", "ranking",
}
RANKING_KEYS = {"min_reviews", "prior_weight", "global_mean_rating"}
PREPROCESSING_KEYS = {"step", "rows_before", "rows_after", "rows_removed", "note"}
AI_KEYS = {
    "group", "product", "rank", "review_count", "weighted_rating",
    "sentiment", "sentiment_review_count", "summary_points",
}


def check(folder: Path) -> list[str]:
    problems: list[str] = []

    def need(name: str) -> Path | None:
        path = folder / name
        if not path.is_file():
            problems.append(f"missing file: {path}")
            return None
        return path

    reviews_p, products_p = need("reviews_clean.csv"), need("product_summary.csv")
    stats_p, ai_p = need("overall_stats.json"), need("ai_summaries.json")

    reviews = products = stats = ai = None
    if reviews_p:
        reviews = pd.read_csv(reviews_p)
        if missing := REVIEW_COLS - set(reviews.columns):
            problems.append(f"reviews_clean.csv: missing columns {sorted(missing)}")
        else:
            if not reviews["Rating"].between(1, 5).all():
                problems.append("reviews_clean.csv: Rating values outside 1-5")
            if bad := set(reviews["Sentiment"].dropna()) - SENTIMENTS:
                problems.append(f"reviews_clean.csv: unexpected Sentiment labels {sorted(bad)}")
            if reviews["Review"].isna().any():
                problems.append("reviews_clean.csv: empty Review text (dashboard search expects text)")
    if products_p:
        products = pd.read_csv(products_p)
        if missing := PRODUCT_COLS - set(products.columns):
            problems.append(f"product_summary.csv: missing columns {sorted(missing)}")
        else:
            ranks = products.loc[products["Eligible"].astype(bool), "Rank"]
            if ranks.isna().any() or ranks.duplicated().any():
                problems.append("product_summary.csv: eligible products need unique, non-empty Rank")
    if stats_p:
        stats = json.loads(stats_p.read_text(encoding="utf-8"))
        if missing := STATS_KEYS - set(stats):
            problems.append(f"overall_stats.json: missing keys {sorted(missing)}")
        elif missing := RANKING_KEYS - set(stats["ranking"]):
            problems.append(f"overall_stats.json: ranking missing keys {sorted(missing)}")
        for i, step in enumerate(stats.get("preprocessing", [])):  # optional block written by the v2 notebook
            if missing := PREPROCESSING_KEYS - set(step):
                problems.append(f"overall_stats.json: preprocessing[{i}] missing keys {sorted(missing)}")
    if ai_p:
        ai = json.loads(ai_p.read_text(encoding="utf-8"))
        items = ai if isinstance(ai, list) else ai.get("items", [])
        if not items:
            problems.append("ai_summaries.json: no records")
        for i, rec in enumerate(items):
            if missing := AI_KEYS - set(rec):
                problems.append(f"ai_summaries.json[{i}]: missing keys {sorted(missing)}")
            if rec.get("status", "ok") != "ok":
                problems.append(f"ai_summaries.json[{i}] ({rec.get('product')}): status={rec.get('status')} - re-run the AI step")

    # Cross-file consistency
    if reviews is not None and stats is not None and not problems:
        if stats["total_reviews"] != len(reviews):
            problems.append(f"total_reviews ({stats['total_reviews']}) != rows in reviews_clean.csv ({len(reviews)})")
        if stats["total_products"] != len(products):
            problems.append(f"total_products ({stats['total_products']}) != rows in product_summary.csv ({len(products)})")
    return problems


def main() -> int:
    folder = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("notebooks/dashboard_data")
    problems = check(folder)
    if problems:
        print(f"{len(problems)} problem(s) in {folder}/:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1
    print(f"OK: {folder}/ matches what the dashboard expects.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
