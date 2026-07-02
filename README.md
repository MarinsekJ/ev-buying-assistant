# EV Transition Economics

Full-stack machine learning project for estimating EV switching practicality and annual savings (`<S_annual>`).

## Deliverables

- D1 Analysis Report: `quarto/analysis-report.qmd`
- D2 Deployed App Source: `app/frontend` and `app/backend`
- D3 AI-Workflow Reflection: `docs/ai-workflow-reflection.md`
- D4 Presentation: `quarto/presentation.qmd`
- D5 Executive Summary: `docs/executive-summary.md`

## Reproducibility

The project uses a single global seed: `RANDOM_STATE = 42`.

The data workflow first attempts Kaggle API download with `KAGGLE_DATASET_SLUG`. If credentials or the exact slug are unavailable, it generates a deterministic fallback dataset with the same business schema so the workflow still runs from a clean checkout.

## Local Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -e .
npm run install:all
```

On Windows PowerShell:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pip install -e .
npm run install:all
```

## Run the ML Workflow

```bash
python -m ev_transition.run_all
```

This creates:

- `data/processed/ev_transition_modeling.csv`
- `models/ev_transition_artifact.joblib`
- `models/classification_leaderboard.csv`
- `models/regression_leaderboard.csv`
- `reports/figures/*.png`

## Run the App

Train the model first, then run:

```bash
npm run dev
```

Frontend: `http://localhost:5173`  
Backend API: `http://localhost:3000`

The backend calls the Python model through `python -m ev_transition.predict`; no model secrets or API keys are exposed to the frontend.

## Render the Quarto Report

```bash
quarto render quarto/analysis-report.qmd
quarto render quarto/presentation.qmd
```

## Docker

```bash
docker compose up --build
```

## Deployment

Frontend deployment target: static hosting at `https://dev.jakamarinsek.com/ev-assist/`.

Backend deployment target: Render Docker web service from the repository root.

See `docs/render-backend-deploy.md` for the Render deployment steps and frontend build variables.
