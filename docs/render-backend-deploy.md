# Render Backend Deployment

This project deploys the API as a Render Docker web service. The frontend remains hosted at:

```text
https://dev.jakamarinsek.com/ev-assist/
```

## Files Used by Render

- `render.yaml` defines the Render web service.
- `Dockerfile` builds one container with Node.js, Python, the backend API, and the trained model artifact.
- `requirements-render.txt` installs the Python packages needed for training the model artifact during the image build and running predictions.
- `.dockerignore` keeps local development files out of the Docker build context.

## Deploy Steps

1. Push this repository to GitHub.

2. In Render, create a new Blueprint from the repository.

3. Render will read `render.yaml` and create a Docker web service named:

   ```text
   ev-transition-api
   ```

4. Keep this environment variable:

   ```text
   FRONTEND_ORIGIN=https://dev.jakamarinsek.com
   ```

   Do not include `/ev-assist/` in the CORS origin. Browsers send only the origin, not the path.

5. Deploy the service.

6. After deploy, open:

   ```text
   https://YOUR-RENDER-SERVICE.onrender.com/health
   ```

   Expected response:

   ```json
   {
     "ok": true,
     "service": "ev-transition-api"
   }
   ```

## If Render Still Installs `requirements.txt`

If the Render log contains this old command:

```text
pip install --no-cache-dir -r requirements.txt && pip install --no-cache-dir -e .
```

Render is not building the current production Dockerfile from this repo. The current Dockerfile uses:

```text
requirements-render.txt
```

Check these items:

- Push the latest commit containing `Dockerfile`, `render.yaml`, and `requirements-render.txt`.
- In Render, redeploy the latest Git commit, not an older deploy.
- If you created the service manually, set the Dockerfile path to `./Dockerfile` and the Docker context to `.`.
- If you created a non-Docker Node service, delete it and create the service from `render.yaml` as a Blueprint.
- Use Render's "Clear build cache & deploy" option after changing Docker/build settings.

## Frontend Build Setting

Before building the frontend for `https://dev.jakamarinsek.com/ev-assist/`, set:

```text
VITE_API_URL=https://YOUR-RENDER-SERVICE.onrender.com
VITE_BASE_PATH=/ev-assist/
```

Then rebuild and upload `app/frontend/dist` to the `/ev-assist/` folder on the frontend host.

## Notes

- The Docker build runs `python -m ev_transition.train`, so the model artifact is generated inside the deployed image.
- No Kaggle credentials are required. If `KAGGLE_DATASET_SLUG` is not configured, the project uses its deterministic fallback dataset.
- The backend reads Render's `PORT` environment variable automatically.
