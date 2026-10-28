# Project history: capstone → standalone project

This project started as a capstone for a data-summarization bootcamp and was later reworked as an independent
portfolio project. Both notebooks are kept so the evolution is visible.

| | Original capstone (`notebooks/archive/`) | Standalone version (`notebooks/01_…`) |
| --- | --- | --- |
| Language | Indonesian | English |
| AI model | IBM Granite 3.3 8B via Replicate + LangChain | Google Gemini via the `google-genai` SDK |
| Model access | Bootcamp-provided; **not reproducible outside the bootcamp** | Anyone with a Gemini API key |
| Secrets | Google Colab `userdata` | `.env` file (`GEMINI_API_KEY`) |
| Environment | Google Colab | Local (Jupyter / VS Code) |
| Ranking | Raw average rating | Bayesian weighted rating with a minimum review count |
| Data cleaning | Rows without review/rating only | Audit step plus nine logged rules: scraper suffix, whitespace, product-name variants, duplicates, personal-data masking, resale posts, robust dates |
| Extra parsed fields | – | `SkinType`, `AgeGroup`, `Recommended`, `PostDate`, `Review_Truncated`, `Review_Length` |
| AI output | Printed in the notebook | Printed **and** stored as structured JSON |
| Export for a dashboard | – | Step 8 writes four files in `notebooks/dashboard_data/` |
| Dashboard | – | Static HTML/JS dashboard in `dashboard/` |

The original notebook is left as it was submitted (apart from redacting usernames in one printed table);
it needs `requirements-legacy.txt` and a Replicate token, and is archived for reference rather than for re-running.
