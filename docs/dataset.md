# Dataset

**Name:** Skincare Review
**Source:** [Kaggle — Skincare Review](https://www.kaggle.com/datasets/hafidahmusthaanah/skincare-review)
**Owner:** `hafidahmusthaanah`
**License:** not verified in this repository — check the Kaggle page for the license and usage conditions
before redistributing the data or anything derived from it.

## Description

Consumer reviews of skincare and beauty products. The text can be used for NLP tasks such as sentiment
analysis, complaint identification and review summarization. This project uses it for exploratory analysis and
a text-analysis prototype, for educational and portfolio purposes.

## Structure (as loaded by the notebook)

The notebook reads `00. Review.csv` from the Kaggle download (8,646 rows, 802 distinct products). Columns:

| Column         | Description                                                        |
| -------------- | ------------------------------------------------------------------ |
| `Product`      | Product name (spelling is as in the source, e.g. "Moiturizing")    |
| `UserName`     | Reviewer handle — **dropped** from every export                    |
| `SkinCond_Age` | Free text such as `Oily, 19 - 24` (skin type and/or age group)     |
| `Recommend`    | "<user> recommends / doesn't recommend this product!" — contains the username, so only a parsed boolean is kept |
| `PostDate`     | Text date such as `12 Jul 2020`; for recent reviews the source shows relative text such as `a day ago` or `6 hours ago` |
| `Review`       | Review text (Indonesian, informal); about 62% of rows end with a scraper's `... Read more` and stop near 270 characters |
| `Rating`       | 1–5 stars                                                          |

The source has **no sentiment label**; `Sentiment` is derived from `Rating` (see [methodology.md](methodology.md)).
Absolute review dates span 2015-09-16 to 2020-09-12; reviews with relative dates have no absolute date in the export.

## Recommended workflow

1. Download the dataset from the original Kaggle source (the notebook does this with `kagglehub`).
2. Inspect structure and data types; check missing values and duplicates (notebook Step 2).
3. Clean and normalize where necessary (notebook Step 3; rules in [methodology.md](methodology.md)).
4. Explore patterns, then apply sentiment analysis, complaint analysis or summarization.

## Limitations

- Completeness and quality should be assessed before analysis; the audit step and the README's data-quality notes list what was found here (truncated text, duplicates, resale posts, phone numbers in review text, relative dates).
- Findings may not represent all skincare consumers or products.
- Complaint and praise themes depend on the actual review content.
- AI-generated summaries should be checked against the original reviews to avoid unsupported conclusions.

## Attribution

Dataset: [Skincare Review — Kaggle](https://www.kaggle.com/datasets/hafidahmusthaanah/skincare-review),
owner `hafidahmusthaanah`. Redistribution of the original data must comply with the applicable license.
