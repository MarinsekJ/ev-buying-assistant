# D3 AI-Workflow Reflection

AI assistance was used to scaffold the repository, design the reproducible workflow, write the modeling code, create the React/Express application, and draft the Quarto deliverables. The generated outputs were checked against the grading requirements: data acquisition path, leakage-safe preprocessing, engineered targets, model ladder, honest metrics, app inputs and outputs, and deployment documentation.

Verification focused on deterministic behavior and reproducibility. The project uses one global `RANDOM_STATE = 42`, scikit-learn pipelines for preprocessing, a Kaggle-first acquisition script with a deterministic fallback, and a Python CLI that the Node API calls directly. The fallback dataset is intentionally documented so a clean checkout can run without API keys.

The largest manual judgment was translating model metrics into consumer language. The app avoids overclaiming and includes an infrastructure warning because a dollar estimate is not useful if charging access is weak. Rough effort was split across data workflow design, model training structure, API bridging, frontend implementation, and written deliverables.

