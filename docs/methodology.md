# Methodology

## 0. Preprocessing

Notebook Step 2 audits the raw data and Step 3 cleans it. Rules run in a fixed order because later rules depend on
earlier ones (duplicates are removed before text is masked; resale posts are detected on the masked text):

1. Drop rows without `Review` or `Rating`; keep ratings from 1 to 5.
2. Strip the scraper's `... Read more` suffix (keeping a `Review_Truncated` flag), collapse whitespace, drop reviews
   shorter than `MIN_REVIEW_CHARS` (10).
3. Merge product names that differ only by letter case or spacing, using the most frequent spelling.
4. Remove exact duplicates on `Product` + `UserName` + `Review` (switch: `DROP_DUPLICATES`).
5. Mask URLs, e-mails, Indonesian mobile numbers and `@handles` as `[URL]`, `[EMAIL]`, `[PHONE]`, `[HANDLE]`
   (switch: `MASK_PII`).
6. Remove resale posts: the text must show sale intent (preloved, WTS, "mau jual", "dijual", a leading "sold") **and**
   a price (`50rb`, `170k`, `Rp ...`) or a contact channel (a masked phone/handle/link, WA, DM, COD)
   (switch: `DROP_RESALE_POSTS`). Requiring both keeps genuine reviews that merely carry a "preloved" tag.
7. Parse `PostDate` as `12 Jul 2020`; retry after mapping Indonesian/long month names; otherwise leave it empty
   (the row is kept).
8. Derive `Sentiment`, `SkinType`, `AgeGroup`, `Recommended`, `Review_Length`.

Each rule appends `{step, rows_before, rows_after, rows_removed, note}` to `preprocessing_log`, which is exported in
`overall_stats.json`. The resale rule is a heuristic; its precision was not measured.

## 1. Sentiment (rule-based)

Sentiment is derived from the star rating, not predicted by a model:

| Rating | Sentiment |
| ------ | --------- |
| 4 – 5  | Positive  |
| 3      | Neutral   |
| 1 – 2  | Negative  |



## 2. Fair product ranking

Ranking by raw average rating is misleading: one 5-star review would beat ten reviews averaging 4.9.
The notebook uses a Bayesian (weighted) average, which pulls each product's average toward the global mean
in proportion to how little evidence it has:

```
weighted_rating = (v × R + m × C) / (v + m)

v = number of reviews for the product
R = average rating of the product
C = global mean rating (all reviews)
m = PRIOR_WEIGHT  (strength of the pull toward C)
```

Two tunable parameters (notebook Step 4, also exported to `overall_stats.json → ranking`):

| Parameter      | Default | Meaning                                                  |
| -------------- | ------- | -------------------------------------------------------- |
| `MIN_REVIEWS`  | 5       | Products with fewer reviews stay listed but are unranked |
| `PRIOR_WEIGHT` | 5       | Higher = more shrinkage toward the global mean           |

Ordering: eligible products first, then `Weighted_Rating` ↓, `Review_Count` ↓, `Product` A→Z.
`Rank 1` is the best product; the "bottom" list is the worst *ranked* product first.

## 3. AI theme summaries

For the 3 best-ranked products the notebook summarizes the three most common reasons behind **Positive**
reviews; for the 3 worst-ranked products, the reasons behind **Negative** reviews.

- Up to `MAX_REVIEWS_PER_PROMPT` (30) reviews are randomly sampled per product/sentiment to keep prompts short.
- Reviews are Indonesian; the prompt asks for English output as a short numbered list.
- Each record stores `status` (`ok` / `error` / `no_reviews`), the model name, the number of matching reviews
  (`sentiment_review_count`) and the sample actually sent to the model (`reviews_used`).
- Because of the random sample, re-running the step can give slightly different wording.

## 4. Export for the dashboard

Step 8 writes four files to `notebooks/dashboard_data/` so the dashboard never recomputes the analysis or
calls the AI. Usernames are dropped from the export. See [data_dictionary.md](data_dictionary.md).
