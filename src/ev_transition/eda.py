from __future__ import annotations

import json

import matplotlib.pyplot as plt
import pandas as pd
try:
    import seaborn as sns
except Exception:  # pragma: no cover - optional plotting dependency
    sns = None

from .config import CLASS_TARGET, FIGURE_DIR, MODEL_DIR, PROCESSED_DIR, REG_TARGET
from .data import load_dataset


def build_report_assets() -> dict[str, object]:
    FIGURE_DIR.mkdir(parents=True, exist_ok=True)
    df = load_dataset()
    summary = {
        "shape": list(df.shape),
        "columns": df.columns.tolist(),
        "dtypes": {column: str(dtype) for column, dtype in df.dtypes.items()},
        "missing": df.isna().sum().to_dict(),
        "class_balance": df[CLASS_TARGET].value_counts(normalize=True).round(3).to_dict(),
        "annual_savings_summary": df[REG_TARGET].describe().round(2).to_dict(),
    }
    with (PROCESSED_DIR / "eda_summary.json").open("w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    if sns:
        sns.set_theme(style="whitegrid")
    fig, axes = plt.subplots(1, 2, figsize=(12, 4))
    if sns:
        sns.histplot(df[REG_TARGET], kde=True, ax=axes[0], color="#4db6ac")
    else:
        axes[0].hist(df[REG_TARGET], bins=30, color="#4db6ac")
    axes[0].set_title("Annual savings distribution")
    counts = df[CLASS_TARGET].value_counts().sort_index()
    axes[1].bar([str(index) for index in counts.index], counts.values, color="#90caf9")
    axes[1].set_title("Practicality rating balance")
    fig.tight_layout()
    fig.savefig(FIGURE_DIR / "target_distributions.png", dpi=160)
    plt.close(fig)

    numeric = df.select_dtypes("number")
    corr = numeric.corr(numeric_only=True)[[CLASS_TARGET, REG_TARGET]].sort_values(REG_TARGET)
    fig, ax = plt.subplots(figsize=(7, 8))
    if sns:
        sns.heatmap(corr, annot=True, cmap="vlag", center=0, ax=ax)
    else:
        image = ax.imshow(corr, cmap="coolwarm", aspect="auto")
        ax.set_yticks(range(len(corr.index)), corr.index)
        ax.set_xticks(range(len(corr.columns)), corr.columns)
        fig.colorbar(image, ax=ax)
    ax.set_title("Feature-target correlations")
    fig.tight_layout()
    fig.savefig(FIGURE_DIR / "feature_target_correlations.png", dpi=160)
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(7, 5))
    sample = df.sample(min(len(df), 1000), random_state=42)
    if sns:
        sns.scatterplot(
            data=sample,
            x="Charging_Density_per_100k",
            y=REG_TARGET,
            hue=CLASS_TARGET,
            alpha=0.65,
            ax=ax,
        )
    else:
        ax.scatter(sample["Charging_Density_per_100k"], sample[REG_TARGET], c=sample[CLASS_TARGET], alpha=0.65)
    ax.set_title("Infrastructure density vs annual savings")
    fig.tight_layout()
    fig.savefig(FIGURE_DIR / "infrastructure_vs_savings.png", dpi=160)
    plt.close(fig)

    class_path = MODEL_DIR / "classification_leaderboard.csv"
    reg_path = MODEL_DIR / "regression_leaderboard.csv"
    summary["classification_leaderboard"] = pd.read_csv(class_path).to_dict("records") if class_path.exists() else []
    summary["regression_leaderboard"] = pd.read_csv(reg_path).to_dict("records") if reg_path.exists() else []
    return summary


if __name__ == "__main__":
    print(json.dumps(build_report_assets(), indent=2, default=str))
