from __future__ import annotations

from pathlib import Path

RANDOM_STATE = 42
ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"
MODEL_DIR = ROOT / "models"
FIGURE_DIR = ROOT / "reports" / "figures"

CLASS_TARGET = "Practicality_Rating"
REG_TARGET = "Annual_Savings"

STATE_DEFAULTS = {
    "CA": {"gas": 5.05, "utility": 0.30, "density": 42, "subsidy": 2000},
    "TX": {"gas": 3.15, "utility": 0.15, "density": 18, "subsidy": 0},
    "NY": {"gas": 3.75, "utility": 0.24, "density": 30, "subsidy": 2000},
    "FL": {"gas": 3.35, "utility": 0.16, "density": 16, "subsidy": 0},
    "IL": {"gas": 3.85, "utility": 0.18, "density": 20, "subsidy": 4000},
    "CO": {"gas": 3.45, "utility": 0.14, "density": 28, "subsidy": 5000},
    "WA": {"gas": 4.55, "utility": 0.12, "density": 34, "subsidy": 0},
    "AZ": {"gas": 3.65, "utility": 0.15, "density": 15, "subsidy": 0},
    "GA": {"gas": 3.25, "utility": 0.14, "density": 12, "subsidy": 0},
    "MA": {"gas": 3.65, "utility": 0.29, "density": 32, "subsidy": 3500},
}

