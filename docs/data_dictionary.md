# Data dictionary

All files are written by notebook Step 8 to `notebooks/dashboard_data/` and read by `dashboard/script.js`.
Run `python scripts/validate_dashboard_data.py` to check a folder against this schema.

## reviews_clean.csv — one row per review

| Column         | Type    | Notes                                                            |
| -------------- | ------- | ---------------------------------------------------------------- |
| `Product`      | text    | Product name as in the source dataset                            |
| `SkinCond_Age` | text    | Raw field, e.g. `Oily, 19 - 24`                                  |
| `PostDate`     | date    | `YYYY-MM-DD` (parsed from `12 Jul 2020`). empty for relative timestamps such as "a day ago" |
| `Review`       | text    | Cleaned review text (Indonesian), phone numbers, @handles, links and e-mails are masked |
| `Rating`       | int 1–5 |                                                                  |
| `Review_Truncated` | boolean | The source text was cut off by the scraper (`... Read more`), the suffix itself is removed |
| `Sentiment`    | text    | `Positive` / `Neutral` / `Negative` (see methodology)            |
| `SkinType`     | text    | Parsed from `SkinCond_Age`, may be empty                         |
| `AgeGroup`     | text    | Parsed from `SkinCond_Age`, may be empty                         |
| `Recommended`  | boolean | Parsed from the "recommends / doesn't recommend" text, may be empty |
| `Review_Length` | int    | Characters in the cleaned `Review`                               |

`UserName` and the raw `Recommend` text (which contains the username) are intentionally not exported.
Column order follows the notebook export.

## product_summary.csv — one row per product

| Column            | Notes                                                      |
| ----------------- | ---------------------------------------------------------- |
| `Product`         |                                                            |
| `Review_Count`    |                                                            |
| `Avg_Rating`      | Raw mean rating                                            |
| `Pct_Positive` / `Pct_Neutral` / `Pct_Negative` | Share of the product's reviews (%) |
| `Weighted_Rating` | Bayesian weighted rating                                   |
| `Eligible`        | `Review_Count >= MIN_REVIEWS`                              |
| `Rank`            | 1 = best, empty for ineligible products                    |

## ai_summaries.json — list of 6 records (top 3 + bottom 3)

Keys: `group` (`top`/`bottom`), `group_position`, `product`, `rank`, `review_count`, `avg_rating`,
`weighted_rating`, `sentiment`, `sentiment_review_count`, `reviews_used`, `summary_text`,
`summary_points` (list), `status`, `error`, `model`, `generated_at`.

## overall_stats.json — dataset-level numbers and metadata

Keys: `generated_at`, `dataset`, `ai_model`, `total_reviews`, `total_products`, `ranked_products`,
`avg_rating`, `sentiment_counts`, `sentiment_pct`, `rating_counts` (keys `"1"`–`"5"`),
`date_range` (`start`, `end`; dated reviews only), `preprocessing` (list of `step`, `rows_before`, `rows_after`,
`rows_removed`, `note`), `ranking` (`method`, `min_reviews`, `prior_weight`, `global_mean_rating`).
