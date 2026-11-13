# CulinaryPulse

CulinaryPulse is a React dashboard backed by a FastAPI service. Its release features match the updated dashboard walkthrough: review-text sentiment, restaurant and curated-sample context, praised/criticized aspects, historical review trends, owner summaries, and searchable source-review evidence. Review-post counts are historical only; no demand forecast or customer-risk prediction is presented.

## What is included

- `main.py` and `requirements-api.txt`: FastAPI service and its runtime dependencies.
- `frontend/`: React/Vite dashboard, dependency lockfile, and production build configuration.
- `netlify.toml`: Netlify frontend build settings.
- `render.yaml`: Render API service and persistent data disk.

Raw Yelp source files, generated databases/models, local environments, presentation assets, and unused starter/demo files are intentionally excluded.

## Dataset requirement and terms

The API requires a prepared `data.json` or `data.json.gz` dataset. No review dataset is included in this upload folder. The Yelp dataset agreement shipped with the source material limits use to academic purposes. Because this is a restaurant-management app, do not use Yelp review text as its public or production data unless you have explicit separate permission. Supply a dataset you are authorized to serve instead.

The Render service reads `/var/data/data.json.gz` by default. Put an authorized prepared dataset on its persistent disk at that path (or change `CULINARPULSE_DATASET_PATH` to the mounted file path), then restart the API. Until data is provided, the service starts but dashboard data endpoints return a clear unavailable response. Keep any private-storage credentials out of GitHub.

## Run locally

Use Python 3.11+ and Node.js 22.12+:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-api.txt
$env:CULINARPULSE_DATASET_PATH = "C:\path\to\authorized\data.json.gz"
python -m uvicorn main:app --reload
```

In another terminal:

```powershell
Set-Location frontend
npm ci
$env:VITE_API_BASE_URL = "http://127.0.0.1:8000"
npm run dev
```

## Publish this clean folder to GitHub

Create a new, empty GitHub repository. Run these commands from this folder, replacing the remote URL with your own:

```powershell
git init -b main
git add .
git commit -m "Initial CulinaryPulse release"
git remote add origin https://github.com/YOUR-ACCOUNT/YOUR-REPOSITORY.git
git push -u origin main
```

This folder has no inherited Git history, so it avoids the multi-gigabyte source-data history in the original working repository.

## Deploy

1. Connect the new repository to Render and deploy the Blueprint in `render.yaml`. The API uses a Standard instance and a 1 GB persistent disk; both can incur charges.
2. Provide an authorized `data.json.gz` on the mounted `/var/data` disk. You can use the Render Shell to download it from storage you control; do not commit the data file or storage credentials.
3. In Render, set `CORS_ORIGINS` to your exact frontend origin, for example `https://your-site.netlify.app` (include `http://localhost:5173` only if needed).
4. Connect the same repository to Netlify. It reads `netlify.toml`; set `VITE_API_BASE_URL` to the Render API URL, then deploy.
5. Confirm the Render `/` health endpoint reports `"status":"ok"` and the Netlify dashboard can load restaurants.

`CULINARPULSE_DATASET_PATH` selects a local JSON or gzip JSON file. `CORS_ORIGINS` is a comma-separated list of allowed browser origins. `VITE_API_BASE_URL` is embedded into the frontend at build time.

No code-reuse license is included. Add a license if you intend to grant others permission to reuse the source.
