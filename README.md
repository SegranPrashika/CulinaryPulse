# CulinaryPulse

CulinaryPulse is a React/Vite dashboard with a FastAPI backend for analyzing a separately supplied restaurant dataset. This repository contains application source only; it does not include a dataset.

## Data use

The Yelp Open Dataset terms allow academic use but prohibit publicly displaying or distributing its data to third parties. Keep Yelp-derived files private and local. For a public deployment, use a dataset whose license explicitly allows public serving. Do not commit datasets, credentials, or dataset-derived evaluation files.

The dashboard and API do not display or return tip text.

## Run locally

Use Python 3.11+ and Node.js 22.12+.

Start the API from the repository root in PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
$env:CULINARPULSE_DATASET_PATH = "C:\path\to\authorized\data.json"
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

In another terminal:

```powershell
Set-Location frontend
npm ci
$env:VITE_API_BASE_URL = "http://127.0.0.1:8000"
npm run dev
```

Open the local URL printed by Vite. Keep private academic data on the local machine and outside Git.

## Deploy

Netlify serves the frontend; the FastAPI service must be deployed separately. Set `VITE_API_BASE_URL` in the Netlify build environment and configure `CORS_ORIGINS` on the API. Only configure a public API with data that is licensed for public serving.

`render.yaml` is an optional Render Blueprint. The API reads the file set by `CULINARPULSE_DATASET_PATH`; store authorized data on persistent storage.
