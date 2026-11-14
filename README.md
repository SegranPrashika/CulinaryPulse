# CulinaryPulse

**Live dashboard:** [ADD YOUR NETLIFY LINK HERE]

**API backend:** [ADD YOUR PXXL API LINK HERE]

CulinaryPulse is a React dashboard backed by a FastAPI service. It presents restaurant-level summaries and searchable review evidence from a prepared, city-specific dataset.

> **Before publishing data:** The Yelp dataset terms limit the source data to academic use. Do not put Yelp review text in a public GitHub repository or serve it publicly unless you have separate permission. The GitHub release folder intentionally excludes the local `data.json.gz`; provide an authorized dataset to the API host instead.

## What this release contains

- `main.py`: FastAPI endpoints for health, restaurant search, review analysis, topics, and review evidence.
- `frontend/`: React/Vite dashboard.
- `requirements.txt` and `requirements-api.txt`: Python runtime dependencies.
- `netlify.toml`: Netlify build settings for the frontend.
- `render.yaml`: Optional Render Blueprint for the API.
- `model_evaluation_metrics.json`: Summary of the supplied offline classifier evaluation.

This deployment bundle consumes a prepared `data.json` or `data.json.gz` file. It does **not** include the raw Yelp files, the data-curation/training pipeline, trained classifier artifacts, or the Master presentation. The evaluation below documents earlier offline experiments; those models are not part of the running dashboard.

## Product scope and model limits

The dashboard provides:

- Sentiment and aspect summaries for a selected restaurant.
- Historical review-post trends and weekday summaries.
- Descriptive comparisons with other restaurants in the same curated city sample.
- Searchable source-review evidence.
- Owner-facing summaries based on review text.

It does not display classifier scores or make cancellation, churn, staffing, sales, customer-demand, or future-customer-behavior predictions. The city sample is descriptive context, not a set of matched competitors. Sentiment and aspect analysis describes review text and can be affected by rule-based language analysis. Review dates help users judge whether historical feedback is still relevant.

### Offline review-classification experiment

The Logistic Regression and XGBoost results are **offline post-review binary-classification experiments**, not business-facing dashboard features. The positive label is a 1–2-star review; the comparison class is a 4–5-star review; 3-star reviews are excluded. Logistic Regression is a linear baseline, while XGBoost is a gradient-boosted tree classifier that can model nonlinear feature interactions.

Inputs were VADER positive/negative/neutral/compound sentiment, log word count, exclamation/question counts, uppercase-letter ratio, and binary aspect-presence features. Stars define the label and are not an input; review votes are excluded. Metrics use a chronological citywide 80/20 holdout and a 0.50 decision threshold for precision, recall, and F1.

The reported holdout contains 14,218 later reviews beginning **2019-04-22**, with 56,701 training reviews. There are 2,092 low-star reviews in the holdout (14.7%).

| Model | Precision | Recall | F1 score | ROC-AUC | PR-AUC |
|---|---:|---:|---:|---:|---:|
| Logistic Regression | 0.587 | 0.882 | 0.705 | 0.950 | 0.798 |
| XGBoost | 0.810 | 0.677 | 0.738 | 0.958 | 0.837 |

F1 is the harmonic mean of precision and recall: `2 × precision × recall / (precision + recall)`. It balances false alarms against missed low-star reviews, but is not overall accuracy: it does not count true negatives and depends on the decision threshold. Read it alongside precision, recall, and the threshold-independent AUC metrics. These values evaluate a review’s star-derived label—not cancellation accuracy, dashboard accuracy, calibrated event probabilities, or future behavior. The metric values are recorded in [`model_evaluation_metrics.json`](model_evaluation_metrics.json).

### Historical review-volume experiment (not a demand forecast)

An earlier experiment forecast monthly Yelp review-post counts, not guests, visits, bookings, orders, sales, or demand. It compared ordinary least-squares linear regression using elapsed time and sine/cosine month-of-year features with a same-month-last-year seasonal-naive baseline. A rolling-origin backtest over the final 12 months used MAE, RMSE, and R².

For Acme Oyster House, the baseline MAE was 8.33 review posts/month versus 17.24 for linear regression; baseline RMSE was 10.38 and R² was -3.406. Review posts are a weak, delayed proxy, and the curated data ends on **2022-01-19**. The forecast feature was removed from the dashboard; no forward projections are shown. F1 is a classification metric, not a regression metric.

## Dataset fields and scope

The API expects a prepared JSON object with a `metadata` object and a non-empty `businesses` list. Each business must have a `business_id`; restaurant reviews and optional analysis fields are read from the records. This deployment bundle does not contain the Yelp file-preparation pipeline, so prepare the authorized dataset separately and point the API at it with `CULINARPULSE_DATASET_PATH`. The original analysis used:

- **Reviews:** review/user/business IDs, stars, full text, useful/funny/cool votes, and review date.
- **Businesses:** name, city/state, business rating, review count, open status, latitude/longitude, categories, and attributes.
- **Users:** reviewer review count and Elite years, joined only to users present in the curated review sample.
- **Tips:** short local tips for selected restaurants, with complimented/recent tips included where available.
- **Restaurant scope:** up to 150 businesses categorized as `Restaurants` in a selected city, with up to 80,000 curated reviews.

The source files do not provide reviewer nationality, booking cancellations, or confirmed visit/return events. Votes may arrive after a review and are retained for display only, not as classifier inputs.

The original Yelp dataset agreement is for academic use. For public deployment, replace the data with a dataset you are authorized to serve. Do not commit the dataset or storage credentials to GitHub. Set `CULINARPULSE_DATASET_PATH` on the API host to the prepared file. If no dataset is available, the API can start, but the root health response reports `dataset_unavailable` and dashboard data endpoints return HTTP 503.

## Run locally

Use Python 3.11+ and Node.js 22.12+.

### Start the API

In PowerShell from the project folder:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
$env:CULINARPULSE_DATASET_PATH = "C:\path\to\authorized\data.json.gz"
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

`CULINARPULSE_DATASET_PATH` is optional if a prepared `data.json` or `data.json.gz` is in the project root. If you have a local copy of the Yelp-derived dataset, do not use it for public or production serving without permission.

### Start the dashboard

In a second PowerShell terminal:

```powershell
Set-Location frontend
npm ci
$env:VITE_API_BASE_URL = "http://127.0.0.1:8000"
npm run dev
```

Open the local URL printed by Vite, usually `http://localhost:5173`. The default API CORS configuration allows this origin.

## Deploy

The dashboard and API are separate deployments. Netlify hosts the static React frontend; deploy the FastAPI backend to Pxxl or another Python web-service host. `render.yaml` is included as an optional Render configuration.

### API backend (Pxxl or another Python host)

Use the repository root as the service root:

```text
Build command: pip install -r requirements.txt
Start command: uvicorn main:app --host 0.0.0.0 --port $PORT
```

Set these environment variables in the API service:

| Variable | Value |
|---|---|
| `CULINARPULSE_DATASET_PATH` | Absolute path to your authorized `data.json` or `data.json.gz` on the service or mounted volume. |
| `CORS_ORIGINS` | Your exact Netlify site origin, e.g. `https://your-site.netlify.app`. Add local origins only when needed. |

Keep the dataset on persistent storage if the host offers it. The API uses an incremental JSON parser to reduce startup memory; memory requirements vary by provider, so select at least 1 GB RAM where available. Do not rely on an ephemeral filesystem for a dataset that must survive restarts.

### Netlify frontend

The root `netlify.toml` configures the `frontend` base directory, `npm run build`, `dist` publish directory, and Node.js 22.12. In Netlify, set this build environment variable:

| Variable | Value |
|---|---|
| `VITE_API_BASE_URL` | The deployed API base URL, e.g. `https://your-api-host.example.com` (no trailing slash required). |

Redeploy the frontend after changing this variable; Vite embeds it at build time. Netlify does not host this FastAPI service. The API must allow the Netlify site origin in `CORS_ORIGINS`.

### Verify the deployment

1. Open `https://your-api-host.example.com/`. Confirm the JSON response contains `"status":"ok"`.
2. Open `https://your-api-host.example.com/api/restaurants`. Confirm it returns restaurant records.
3. Open the Netlify dashboard and confirm the restaurant list and analysis load.
4. If the root endpoint reports `dataset_unavailable`, check the API service’s dataset path and mounted volume. If the dashboard reports a network/CORS error, check `VITE_API_BASE_URL` and `CORS_ORIGINS`.

## Publish a clean folder to GitHub

Use the separate `CulinaryPulse_GitHub_Release` folder prepared alongside this working folder. It contains the app source and documentation, but excludes `.git`, local environments, credentials, build output, and the Yelp-derived dataset. Create a new, empty GitHub repository for that folder. From PowerShell:

```powershell
Set-Location C:\path\to\CulinaryPulse_GitHub_Release
git init -b main
git add .
git status --short
git commit -m "Initial CulinaryPulse release"
git remote add origin https://github.com/YOUR-ACCOUNT/YOUR-REPOSITORY.git
git push -u origin main
```

Review the `git status` output before committing. Do not copy `.env`, private data, or credentials into the release folder. The existing working repository contains a dataset file in its Git history; use the clean release folder for a new public repository rather than pushing that existing history.

No code-reuse license is included. Add a license if you intend to grant others permission to reuse the source.
