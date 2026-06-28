from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import joblib
import pandas as pd

from .config import MODEL_DIR, STATE_DEFAULTS
from .features import derive_targets, normalize_schema


def build_input(weekly_commute_miles: float, state: str, utility_rate: float) -> pd.DataFrame:
    code = state.upper()
    defaults = STATE_DEFAULTS.get(code, {"gas": 3.65, "utility": utility_rate, "density": 14, "subsidy": 0})
    row = {
        "State": code,
        "Weekly_Commute_Miles": weekly_commute_miles,
        "Annual_Miles": weekly_commute_miles * 52,
        "Gas_Price_Per_Gallon": defaults["gas"],
        "Fuel_Efficiency_MPG": 29.0,
        "EV_Efficiency_kWh_per_Mile": 0.31,
        "Utility_Rate_per_kWh": utility_rate,
        "Charging_Density_per_100k": defaults["density"],
        "Local_Charging_Stations": defaults["density"] * 4,
        "Population_Density": 250.0,
        "State_EV_Subsidy": defaults["subsidy"],
        "Federal_Tax_Credit_Eligible": 1,
        "Home_Charging_Access": 1,
        "Vehicle_Price_EV": 41000.0,
        "Vehicle_Price_Gas": 33500.0,
        "Maintenance_Savings_Annual": 520.0,
        "Insurance_Delta_Annual": 120.0,
    }
    return normalize_schema(pd.DataFrame([row]))


def predict(weekly_commute_miles: float, state: str, utility_rate: float) -> dict[str, object]:
    model_dir = Path(os.getenv("MODEL_DIR", MODEL_DIR))
    artifact_path = model_dir / "ev_transition_artifact.joblib"
    if not artifact_path.exists():
        raise FileNotFoundError(f"Missing model artifact at {artifact_path}. Run `python -m ev_transition.train`.")
    artifact = joblib.load(artifact_path)
    X = build_input(weekly_commute_miles, state, utility_rate)
    savings = float(artifact["regressor"].predict(X)[0])
    practical_proba = float(artifact["classifier"].predict_proba(X)[0][1])
    density = float(X["Charging_Density_per_100k"].iloc[0])
    daily_need = weekly_commute_miles / 5 * 1.25
    warning = density < max(10, daily_need / 3)
    rule_targets = derive_targets(X)
    return {
        "annual_savings": round(savings, 2),
        "formatted_annual_savings": f"<S_annual> ${savings:,.0f}",
        "practicality_probability": round(practical_proba, 3),
        "practicality_rating": "Practical" if practical_proba >= 0.5 else "Challenging",
        "infrastructure_warning": warning,
        "infrastructure_density_per_100k": density,
        "rule_based_annual_savings": float(rule_targets["Annual_Savings"].iloc[0]),
        "model_versions": {"classifier": artifact["class_model"], "regressor": artifact["reg_model"]},
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--weekly-commute-miles", type=float, required=True)
    parser.add_argument("--state", required=True)
    parser.add_argument("--utility-rate", type=float, required=True)
    args = parser.parse_args()
    print(json.dumps(predict(args.weekly_commute_miles, args.state, args.utility_rate)))


if __name__ == "__main__":
    main()

