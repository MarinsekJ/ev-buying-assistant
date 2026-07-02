from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any, Mapping

import joblib
import pandas as pd

from .config import MODEL_DIR
from .features import derive_targets, normalize_schema


def build_input(raw_payload: Mapping[str, Any]) -> pd.DataFrame:
    return pd.DataFrame([dict(raw_payload)])


def load_pipeline():
    model_dir = Path(os.getenv("MODEL_DIR", MODEL_DIR))
    artifact_path = model_dir / "ev_transition_artifact.joblib"
    if not artifact_path.exists():
        raise FileNotFoundError(f"Missing model artifact at {artifact_path}. Run `python -m ev_transition.train`.")

    artifact = joblib.load(artifact_path)
    if hasattr(artifact, "predict") and hasattr(artifact, "predict_proba"):
        return artifact

    # Backward compatibility for artifacts created before the single-asset wrapper.
    if isinstance(artifact, dict) and {"classifier", "regressor"}.issubset(artifact):
        from .model import EVTransitionPipeline

        return EVTransitionPipeline(
            classifier=artifact["classifier"],
            regressor=artifact["regressor"],
            class_model=artifact.get("class_model", "unknown-classifier"),
            reg_model=artifact.get("reg_model", "unknown-regressor"),
            feature_columns=artifact.get("feature_columns", []),
            random_state=artifact.get("random_state", 42),
        )

    raise TypeError(f"Unsupported model artifact format at {artifact_path}.")


def predict_from_payload(raw_payload: Mapping[str, Any]) -> dict[str, object]:
    pipeline = load_pipeline()
    X = build_input(raw_payload)
    normalized = pipeline.prepare_input(X) if hasattr(pipeline, "prepare_input") else normalize_schema(X)
    prediction = pipeline.predict(X)
    savings = float(prediction["Annual_Savings"].iloc[0])
    practical_proba = float(pipeline.predict_proba(X)[0][1])
    weekly_commute_miles = float(normalized["Weekly_Commute_Miles"].iloc[0])
    density = float(normalized["Charging_Density_per_100k"].iloc[0])
    daily_need = weekly_commute_miles / 5 * 1.25
    warning = density < max(10, daily_need / 3)
    rule_targets = derive_targets(normalized)
    model_versions = getattr(pipeline, "model_versions", {"classifier": "unknown", "regressor": "unknown"})
    return {
        "state": str(normalized["State"].iloc[0]),
        "annual_savings": round(savings, 2),
        "formatted_annual_savings": f"${savings:,.0f}",
        "practicality_probability": round(practical_proba, 3),
        "practicality_rating": "Practical" if practical_proba >= 0.5 else "Challenging",
        "infrastructure_warning": warning,
        "infrastructure_density_per_100k": density,
        "gas_price_per_gallon": float(normalized["Gas_Price_Per_Gallon"].iloc[0]),
        "rule_based_annual_savings": float(rule_targets["Annual_Savings"].iloc[0]),
        "model_versions": model_versions,
    }


def predict(weekly_commute_miles: float, state: str, utility_rate: float) -> dict[str, object]:
    return predict_from_payload(
        {
            "Weekly_Commute_Miles": weekly_commute_miles,
            "State": state,
            "Utility_Rate_per_kWh": utility_rate,
        }
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--weekly-commute-miles", type=float, required=True)
    parser.add_argument("--state", required=True)
    parser.add_argument("--utility-rate", type=float, required=True)
    args = parser.parse_args()
    print(json.dumps(predict(args.weekly_commute_miles, args.state, args.utility_rate)))


if __name__ == "__main__":
    main()
