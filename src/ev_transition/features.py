from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin

from .config import CLASS_TARGET, REG_TARGET


ALIASES = {
    "state": "State",
    "weekly_miles": "Weekly_Commute_Miles",
    "weekly_commute_miles": "Weekly_Commute_Miles",
    "annual_miles_traveled": "Annual_Miles",
    "electricity_rate": "Utility_Rate_per_kWh",
    "utility_rate": "Utility_Rate_per_kWh",
    "gas_price": "Gas_Price_Per_Gallon",
    "charging_density": "Charging_Density_per_100k",
    "subsidy": "State_EV_Subsidy",
}


def normalize_schema(df: pd.DataFrame) -> pd.DataFrame:
    renamed = {}
    for column in df.columns:
        key = column.strip().lower().replace(" ", "_")
        renamed[column] = ALIASES.get(key, column.strip().replace(" ", "_"))
    out = df.rename(columns=renamed).copy()
    if "Weekly_Commute_Miles" not in out and "Daily_Commute_Miles" in out:
        out["Weekly_Commute_Miles"] = out["Daily_Commute_Miles"] * 5
    if "Annual_Miles" not in out:
        out["Annual_Miles"] = out.get("Weekly_Commute_Miles", 150) * 52
    defaults = {
        "State": "US",
        "Gas_Price_Per_Gallon": 3.65,
        "Fuel_Efficiency_MPG": 29.0,
        "EV_Efficiency_kWh_per_Mile": 0.31,
        "Utility_Rate_per_kWh": 0.17,
        "Charging_Density_per_100k": 18.0,
        "Local_Charging_Stations": 40.0,
        "Population_Density": 250.0,
        "State_EV_Subsidy": 0.0,
        "Federal_Tax_Credit_Eligible": 1,
        "Home_Charging_Access": 1,
        "Vehicle_Price_EV": 41000.0,
        "Vehicle_Price_Gas": 33500.0,
        "Maintenance_Savings_Annual": 520.0,
        "Insurance_Delta_Annual": 120.0,
    }
    for column, value in defaults.items():
        if column not in out:
            out[column] = value
    return out


def derive_targets(df: pd.DataFrame) -> pd.DataFrame:
    out = normalize_schema(df)
    weekly = pd.to_numeric(out["Weekly_Commute_Miles"], errors="coerce").fillna(150)
    daily_range_need = weekly / 5 * 1.25
    charging_density = pd.to_numeric(out["Charging_Density_per_100k"], errors="coerce").fillna(15)
    state_subsidy = pd.to_numeric(out["State_EV_Subsidy"], errors="coerce").fillna(0)
    federal = pd.to_numeric(out["Federal_Tax_Credit_Eligible"], errors="coerce").fillna(0) * 7500
    home = pd.to_numeric(out["Home_Charging_Access"], errors="coerce").fillna(0)
    infrastructure_ratio = charging_density / np.maximum(daily_range_need / 2.5, 1)
    subsidy_eligible = (state_subsidy + federal) > 0
    out[CLASS_TARGET] = ((infrastructure_ratio >= 0.85) & ((home == 1) | subsidy_eligible)).astype(int)

    annual_miles = pd.to_numeric(out["Annual_Miles"], errors="coerce").fillna(weekly * 52)
    gas_cost = annual_miles / pd.to_numeric(out["Fuel_Efficiency_MPG"], errors="coerce").fillna(29) * pd.to_numeric(
        out["Gas_Price_Per_Gallon"], errors="coerce"
    ).fillna(3.65)
    ev_energy_cost = (
        annual_miles
        * pd.to_numeric(out["EV_Efficiency_kWh_per_Mile"], errors="coerce").fillna(0.31)
        * pd.to_numeric(out["Utility_Rate_per_kWh"], errors="coerce").fillna(0.17)
    )
    incentives = state_subsidy + federal
    price_premium = pd.to_numeric(out["Vehicle_Price_EV"], errors="coerce").fillna(41000) - pd.to_numeric(
        out["Vehicle_Price_Gas"], errors="coerce"
    ).fillna(33500)
    annualized_net_premium = np.maximum(price_premium - incentives, 0) / 6
    out[REG_TARGET] = (
        gas_cost
        - ev_energy_cost
        + pd.to_numeric(out["Maintenance_Savings_Annual"], errors="coerce").fillna(520)
        - pd.to_numeric(out["Insurance_Delta_Annual"], errors="coerce").fillna(120)
        - annualized_net_premium
    ).round(2)
    return out


class DomainFeatureEngineer(BaseEstimator, TransformerMixin):
    """Add domain features without learning from the full dataset."""

    def fit(self, X: pd.DataFrame, y=None):
        return self

    def transform(self, X: pd.DataFrame) -> pd.DataFrame:
        out = normalize_schema(pd.DataFrame(X).copy())
        weekly = pd.to_numeric(out["Weekly_Commute_Miles"], errors="coerce").fillna(150)
        out["Daily_Range_Need"] = weekly / 5 * 1.25
        out["Operating_Cost_Gas_per_Mile"] = pd.to_numeric(out["Gas_Price_Per_Gallon"], errors="coerce").fillna(
            3.65
        ) / pd.to_numeric(out["Fuel_Efficiency_MPG"], errors="coerce").fillna(29)
        out["Operating_Cost_EV_per_Mile"] = pd.to_numeric(
            out["Utility_Rate_per_kWh"], errors="coerce"
        ).fillna(0.17) * pd.to_numeric(out["EV_Efficiency_kWh_per_Mile"], errors="coerce").fillna(0.31)
        out["Infrastructure_Ratio"] = pd.to_numeric(
            out["Charging_Density_per_100k"], errors="coerce"
        ).fillna(15) / np.maximum(out["Daily_Range_Need"] / 2.5, 1)
        out["Total_Incentive"] = pd.to_numeric(out["State_EV_Subsidy"], errors="coerce").fillna(0) + (
            pd.to_numeric(out["Federal_Tax_Credit_Eligible"], errors="coerce").fillna(0) * 7500
        )
        out["EV_Price_Premium"] = pd.to_numeric(out["Vehicle_Price_EV"], errors="coerce").fillna(41000) - pd.to_numeric(
            out["Vehicle_Price_Gas"], errors="coerce"
        ).fillna(33500)
        return out


class OutlierCapper(BaseEstimator, TransformerMixin):
    """Winsorize numeric columns using train-split quantiles only."""

    def __init__(self, lower: float = 0.01, upper: float = 0.99):
        self.lower = lower
        self.upper = upper

    def fit(self, X: pd.DataFrame, y=None):
        frame = pd.DataFrame(X).copy()
        self.numeric_columns_ = frame.select_dtypes(include=["number", "bool"]).columns.tolist()
        self.lower_bounds_ = frame[self.numeric_columns_].quantile(self.lower)
        self.upper_bounds_ = frame[self.numeric_columns_].quantile(self.upper)
        return self

    def transform(self, X: pd.DataFrame) -> pd.DataFrame:
        frame = pd.DataFrame(X).copy()
        for column in getattr(self, "numeric_columns_", []):
            if column in frame:
                frame[column] = pd.to_numeric(frame[column], errors="coerce").clip(
                    self.lower_bounds_[column], self.upper_bounds_[column]
                )
        return frame
