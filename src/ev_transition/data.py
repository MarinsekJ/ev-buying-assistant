from __future__ import annotations

import os
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd

from .config import PROCESSED_DIR, RAW_DIR, RANDOM_STATE, STATE_DEFAULTS
from .features import derive_targets, normalize_schema


def download_kaggle_dataset(target_dir: Path = RAW_DIR) -> Path | None:
    """Download the Kaggle dataset when credentials and a valid slug are present."""
    target_dir.mkdir(parents=True, exist_ok=True)
    slug = os.getenv(
        "KAGGLE_DATASET_SLUG",
        "replace-with-kaggle-owner/from-fuel-to-electric-the-ev-transition-dataset",
    )
    if slug.startswith("replace-with"):
        return None
    try:
        from kaggle.api.kaggle_api_extended import KaggleApi

        api = KaggleApi()
        api.authenticate()
        api.dataset_download_files(slug, path=target_dir, unzip=False, quiet=False)
    except Exception as exc:
        print(f"Kaggle download skipped: {exc}")
        return None

    zip_files = sorted(target_dir.glob("*.zip"), key=lambda p: p.stat().st_mtime, reverse=True)
    if zip_files:
        with zipfile.ZipFile(zip_files[0]) as archive:
            archive.extractall(target_dir)
    csv_files = sorted(target_dir.glob("*.csv"), key=lambda p: p.stat().st_size, reverse=True)
    return csv_files[0] if csv_files else None


def generate_synthetic_ev_dataset(n_rows: int = 2500, seed: int = RANDOM_STATE) -> pd.DataFrame:
    """Deterministic fallback shaped like a consumer EV transition dataset."""
    rng = np.random.default_rng(seed)
    states = np.array(list(STATE_DEFAULTS))
    state = rng.choice(states, size=n_rows, replace=True)
    defaults = pd.DataFrame([STATE_DEFAULTS[s] for s in state])

    weekly_commute = np.clip(rng.normal(165, 70, n_rows), 20, 520)
    annual_miles = np.clip(weekly_commute * 52 + rng.normal(2500, 1100, n_rows), 3500, 32000)
    utility = np.clip(defaults["utility"].to_numpy() + rng.normal(0, 0.025, n_rows), 0.08, 0.42)
    gas = np.clip(defaults["gas"].to_numpy() + rng.normal(0, 0.25, n_rows), 2.65, 5.75)
    density = np.clip(defaults["density"].to_numpy() + rng.normal(0, 8, n_rows), 1, 65)
    home_charging = rng.binomial(1, np.clip(0.72 - weekly_commute / 1400 + density / 220, 0.35, 0.9))
    federal_eligible = rng.binomial(1, 0.74, n_rows)
    ev_eff = np.clip(rng.normal(0.31, 0.04, n_rows), 0.22, 0.46)
    mpg = np.clip(rng.normal(29, 6, n_rows), 16, 48)
    ev_price = np.clip(rng.normal(41500, 8500, n_rows), 26000, 72000)
    gas_price_vehicle = np.clip(rng.normal(33500, 6500, n_rows), 19000, 61000)

    df = pd.DataFrame(
        {
            "State": state,
            "Weekly_Commute_Miles": weekly_commute.round(1),
            "Annual_Miles": annual_miles.round(0),
            "Gas_Price_Per_Gallon": gas.round(2),
            "Fuel_Efficiency_MPG": mpg.round(1),
            "EV_Efficiency_kWh_per_Mile": ev_eff.round(3),
            "Utility_Rate_per_kWh": utility.round(3),
            "Charging_Density_per_100k": density.round(1),
            "Local_Charging_Stations": np.clip((density * rng.normal(4.8, 1.2, n_rows)).round(), 1, 500),
            "Population_Density": np.clip(rng.lognormal(5.0, 0.7, n_rows), 25, 3000).round(0),
            "State_EV_Subsidy": defaults["subsidy"].to_numpy(),
            "Federal_Tax_Credit_Eligible": federal_eligible,
            "Home_Charging_Access": home_charging,
            "Vehicle_Price_EV": ev_price.round(0),
            "Vehicle_Price_Gas": gas_price_vehicle.round(0),
            "Maintenance_Savings_Annual": np.clip(rng.normal(520, 130, n_rows), 150, 900).round(0),
            "Insurance_Delta_Annual": np.clip(rng.normal(120, 95, n_rows), -150, 450).round(0),
        }
    )
    return derive_targets(df)


def load_dataset() -> pd.DataFrame:
    csv_files = sorted(RAW_DIR.glob("*.csv"), key=lambda p: p.stat().st_size, reverse=True)
    source = csv_files[0] if csv_files else download_kaggle_dataset()
    if source:
        df = pd.read_csv(source)
        df = derive_targets(normalize_schema(df))
    else:
        df = generate_synthetic_ev_dataset()
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    df.to_csv(PROCESSED_DIR / "ev_transition_modeling.csv", index=False)
    return df


if __name__ == "__main__":
    data = load_dataset()
    print(data.shape)
    print(data.dtypes)

