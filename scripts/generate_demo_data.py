#!/usr/bin/env python3
"""Generate SYNTHETIC demo data for the dashboard.

The real dashboard data is produced by ``notebooks/01_skincare_review_analysis.ipynb``
(Kaggle dataset + Gemini summaries). This script writes files with the *same schema*
using invented products and invented review text, so the dashboard can be previewed
(and tested in CI) without a Kaggle login or a Gemini API key.

The statistics are computed with the same formulas as the notebook (sentiment rule,
Bayesian weighted rating, minimum review count, rank), so the output is a faithful
schema/behaviour stand-in - but none of the numbers describe real products.

Usage:
    python scripts/generate_demo_data.py                 # -> notebooks/dashboard_data/
    python scripts/generate_demo_data.py --out some/dir  # custom folder
    python scripts/generate_demo_data.py --force         # overwrite existing files
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pandas as pd

SEED = 42
MIN_REVIEWS = 5  # same defaults as the notebook (Step 4)
PRIOR_WEIGHT = 5
SENTIMENT_ORDER = ["Positive", "Neutral", "Negative"]
DEMO_MODEL = "synthetic-demo (no AI model used)"
DEMO_DATASET = "synthetic-demo (not real reviews)"

FORMS = ["Serum", "Moisturizer", "Cleanser", "Toner", "Sunscreen", "Face Mask", "Eye Cream", "Essence"]
TRAITS = ["Hydrating", "Brightening", "Calming", "Oil-Control", "Repair", "Gentle"]
SKIN_TYPES = ["Normal", "Oily", "Dry", "Combination", "Sensitive"]
AGE_GROUPS = ["<= 18", "19 - 24", "25 - 29", "30 - 34", "35 - 39"]

# Invented, generic review sentences (Indonesian, like the real data) per sentiment.
TEXT = {
    "Positive": [
        "Teksturnya ringan dan cepat meresap, kulit jadi lembap seharian.",
        "Cocok banget di kulitku, tidak bikin bruntusan dan wanginya enak.",
        "Hasilnya terlihat dalam dua minggu, wajah lebih cerah dan halus.",
        "Repurchase terus, harganya sepadan dengan kualitasnya.",
    ],
    "Neutral": [
        "Lumayan sih, tapi efeknya tidak sebesar yang dijanjikan.",
        "Teksturnya enak tapi agak lama meresap, hasilnya biasa saja.",
        "Cukup oke untuk dipakai harian, belum terlihat perubahan berarti.",
    ],
    "Negative": [
        "Bikin wajah lengket dan berminyak, tidak cocok di kulitku.",
        "Setelah dipakai muncul jerawat kecil dan kulit terasa perih.",
        "Wanginya terlalu menyengat dan hasilnya tidak terasa sama sekali.",
        "Kemasannya bocor dan produknya terlalu encer, kecewa.",
    ],
}

AI_POINTS = {
    "top": [
        "Lightweight texture that absorbs quickly.",
        "Gentle on sensitive skin without causing breakouts.",
        "Visible brightening and hydration after regular use.",
    ],
    "bottom": [
        "Sticky or greasy feel after application.",
        "Irritation or breakouts on sensitive and oily skin.",
        "Strong fragrance and results below expectations.",
    ],
}


def classify_sentiment(rating: int) -> str:
    if rating >= 4:
        return "Positive"
    if rating == 3:
        return "Neutral"
    return "Negative"


def build_reviews(rng: random.Random) -> pd.DataFrame:
    products = [f"Demo {trait} {form}" for form in FORMS for trait in TRAITS][:36]
    rows = []
    start, end = date(2020, 1, 1), date(2021, 6, 30)
    span = (end - start).days
    for i, product in enumerate(products):
        quality = rng.uniform(2.6, 4.9)  # hidden "true" quality drives the rating mix
        n = rng.choice([3, 4, 6, 8, 10, 10, 12, 14]) if i % 9 else 3  # a few under-reviewed products
        for _ in range(n):
            rating = min(5, max(1, round(rng.gauss(quality, 0.9))))
            sentiment = classify_sentiment(rating)
            skin, age = rng.choice(SKIN_TYPES), rng.choice(AGE_GROUPS)
            recommended = rating >= 4 if rng.random() > 0.15 else rating >= 3
            review = rng.choice(TEXT[sentiment])
            rows.append(
                {
                    "Product": product,
                    "SkinCond_Age": f"{skin}, {age}",
                    "PostDate": (start + timedelta(days=rng.randint(0, span))).isoformat(),
                    "Review": review,
                    "Rating": rating,
                    "Review_Truncated": rng.random() < 0.6,
                    "Sentiment": sentiment,
                    "SkinType": skin,
                    "AgeGroup": age,
                    "Recommended": recommended,
                    "Review_Length": len(review),
                }
            )
    return pd.DataFrame(rows)


def build_summary(df: pd.DataFrame) -> tuple[pd.DataFrame, float]:
    """Same logic as notebook Steps 3-4."""
    perf = df.groupby("Product").agg(Review_Count=("Product", "count"), Avg_Rating=("Rating", "mean")).reset_index()
    perf["Avg_Rating"] = perf["Avg_Rating"].round(3)

    pct = df.groupby(["Product", "Sentiment"]).size().unstack(fill_value=0)
    pct = pct.reindex(columns=SENTIMENT_ORDER, fill_value=0)
    pct = pct.div(pct.sum(axis=1), axis=0).mul(100).round(2)
    pct.columns = [f"Pct_{c}" for c in pct.columns]

    table = perf.merge(pct, on="Product", how="left").fillna(0)
    global_mean = df["Rating"].mean()
    table["Weighted_Rating"] = (
        (table["Review_Count"] * table["Avg_Rating"] + PRIOR_WEIGHT * global_mean)
        / (table["Review_Count"] + PRIOR_WEIGHT)
    ).round(3)
    table["Eligible"] = table["Review_Count"] >= MIN_REVIEWS
    table = table.sort_values(
        by=["Eligible", "Weighted_Rating", "Review_Count", "Product"],
        ascending=[False, False, False, True],
    ).reset_index(drop=True)
    table["Rank"] = pd.Series(range(1, len(table) + 1)).where(table["Eligible"]).astype("Int64")
    return table, float(global_mean)


def build_ai_records(df: pd.DataFrame, table: pd.DataFrame) -> list[dict]:
    ranked = table[table["Eligible"]]
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    records = []
    for group, sentiment, subset in [
        ("top", "Positive", ranked.head(3)),
        ("bottom", "Negative", ranked.tail(3).iloc[::-1]),
    ]:
        for position, row in enumerate(subset.itertuples(), start=1):
            n = int(((df["Product"] == row.Product) & (df["Sentiment"] == sentiment)).sum())
            points = AI_POINTS[group]
            records.append(
                {
                    "group": group,
                    "group_position": position,
                    "product": row.Product,
                    "rank": int(row.Rank),
                    "review_count": int(row.Review_Count),
                    "avg_rating": float(row.Avg_Rating),
                    "weighted_rating": float(row.Weighted_Rating),
                    "sentiment": sentiment,
                    "sentiment_review_count": n,
                    "reviews_used": min(n, 30),
                    "summary_text": "\n".join(f"{i}. {p}" for i, p in enumerate(points, 1)),
                    "summary_points": points,
                    "status": "ok" if n else "no_reviews",
                    "error": None,
                    "model": DEMO_MODEL,
                    "generated_at": now,
                }
            )
    return records


def build_stats(df: pd.DataFrame, table: pd.DataFrame, global_mean: float) -> dict:
    counts = df["Sentiment"].value_counts().reindex(SENTIMENT_ORDER, fill_value=0)
    ratings = df["Rating"].value_counts().reindex([1, 2, 3, 4, 5], fill_value=0)
    dates = pd.to_datetime(df["PostDate"])
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "dataset": DEMO_DATASET,
        "ai_model": DEMO_MODEL,
        "total_reviews": int(len(df)),
        "total_products": int(df["Product"].nunique()),
        "ranked_products": int(table["Eligible"].sum()),
        "avg_rating": round(float(df["Rating"].mean()), 3),
        "sentiment_counts": {k: int(v) for k, v in counts.items()},
        "sentiment_pct": (counts / counts.sum() * 100).round(2).to_dict(),
        "rating_counts": {str(k): int(v) for k, v in ratings.items()},
        "date_range": {"start": dates.min().strftime("%Y-%m-%d"), "end": dates.max().strftime("%Y-%m-%d")},
        "preprocessing": [
            {
                "step": "Synthetic demo data - no cleaning applied",
                "rows_before": int(len(df)),
                "rows_after": int(len(df)),
                "rows_removed": 0,
                "note": "generated by scripts/generate_demo_data.py",
            }
        ],
        "ranking": {
            "method": "Bayesian (weighted) average rating",
            "min_reviews": MIN_REVIEWS,
            "prior_weight": PRIOR_WEIGHT,
            "global_mean_rating": round(global_mean, 3),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", default="notebooks/dashboard_data", help="output folder (default: %(default)s)")
    parser.add_argument("--force", action="store_true", help="overwrite existing files")
    args = parser.parse_args()

    out = Path(args.out)
    targets = ["reviews_clean.csv", "product_summary.csv", "ai_summaries.json", "overall_stats.json"]
    existing = [t for t in targets if (out / t).exists()]
    if existing and not args.force:
        print(f"Refusing to overwrite existing files in {out}/: {', '.join(existing)}")
        print("These may be real notebook outputs. Use --out <other folder> or --force.")
        return 1

    rng = random.Random(SEED)
    df = build_reviews(rng)
    table, global_mean = build_summary(df)
    ai = build_ai_records(df, table)
    stats = build_stats(df, table, global_mean)

    out.mkdir(parents=True, exist_ok=True)
    df.to_csv(out / "reviews_clean.csv", index=False)
    table.to_csv(out / "product_summary.csv", index=False)
    (out / "ai_summaries.json").write_text(json.dumps(ai, ensure_ascii=False, indent=2), encoding="utf-8")
    (out / "overall_stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Wrote synthetic demo data to {out}/")
    print(f"  {stats['total_reviews']} reviews, {stats['total_products']} products, {stats['ranked_products']} ranked")
    return 0


if __name__ == "__main__":
    sys.exit(main())
