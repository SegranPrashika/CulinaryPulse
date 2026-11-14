# CulinaryPulse frontend

The dashboard is a React/Vite client for the CulinaryPulse FastAPI service. From this directory:

```sh
npm ci
npm run dev
```

For a production build, set `VITE_API_BASE_URL` to the deployed API base URL, then run `npm run build`. The Netlify configuration at the repository root builds this directory and publishes `dist/`.

See the repository's [README](../README.md) for API setup, data preparation, tests, and deployment instructions.
