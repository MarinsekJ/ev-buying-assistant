from __future__ import annotations

import json
from pathlib import Path

import joblib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.base import clone
from sklearn.dummy import DummyClassifier, DummyRegressor
from sklearn.feature_selection import SelectFromModel
from sklearn.impute import SimpleImputer
from sklearn.linear_model import Lasso, LogisticRegression, Ridge
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    precision_score,
    r2_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import GridSearchCV, StratifiedKFold, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor

from .config import CLASS_TARGET, FIGURE_DIR, MODEL_DIR, RANDOM_STATE, REG_TARGET
from .data import load_dataset
from .features import DomainFeatureEngineer, OutlierCapper

try:
    from xgboost import XGBClassifier, XGBRegressor
except Exception:  # pragma: no cover - dependency may be unavailable during static checks
    XGBClassifier = None
    XGBRegressor = None


DROP_COLUMNS = [CLASS_TARGET, REG_TARGET]


def split_data(df: pd.DataFrame):
    X = df.drop(columns=DROP_COLUMNS)
    y_class = df[CLASS_TARGET].astype(int)
    y_reg = df[REG_TARGET].astype(float)
    X_train, X_temp, yc_train, yc_temp, yr_train, yr_temp = train_test_split(
        X,
        y_class,
        y_reg,
        test_size=0.30,
        random_state=RANDOM_STATE,
        stratify=y_class,
    )
    X_val, X_test, yc_val, yc_test, yr_val, yr_test = train_test_split(
        X_temp,
        yc_temp,
        yr_temp,
        test_size=0.50,
        random_state=RANDOM_STATE,
        stratify=yc_temp,
    )
    return X_train, X_val, X_test, yc_train, yc_val, yc_test, yr_train, yr_val, yr_test


def make_preprocessor(X: pd.DataFrame) -> ColumnTransformer:
    numeric_features = X.select_dtypes(include=["number", "bool"]).columns.tolist()
    categorical_features = [c for c in X.columns if c not in numeric_features]
    numeric_pipe = Pipeline(
        [
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]
    )
    categorical_pipe = Pipeline(
        [
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("encoder", OneHotEncoder(handle_unknown="ignore")),
        ]
    )
    return ColumnTransformer(
        [
            ("num", numeric_pipe, numeric_features),
            ("cat", categorical_pipe, categorical_features),
        ],
        remainder="drop",
    )


def class_models(preprocessor: ColumnTransformer) -> dict[str, object]:
    selector = SelectFromModel(
        LogisticRegression(
            penalty="l1",
            solver="liblinear",
            C=0.2,
            random_state=RANDOM_STATE,
            max_iter=1500,
        )
    )
    models = {
        "Dummy": Pipeline(
            [
                ("features", DomainFeatureEngineer()),
                ("cap_outliers", OutlierCapper()),
                ("prep", clone(preprocessor)),
                ("model", DummyClassifier(strategy="most_frequent")),
            ]
        ),
        "LogisticRegression": Pipeline(
            [
                ("features", DomainFeatureEngineer()),
                ("cap_outliers", OutlierCapper()),
                ("prep", clone(preprocessor)),
                ("select", selector),
                ("model", LogisticRegression(max_iter=1500, random_state=RANDOM_STATE)),
            ]
        ),
        "DecisionTree": Pipeline(
            [
                ("features", DomainFeatureEngineer()),
                ("cap_outliers", OutlierCapper()),
                ("prep", clone(preprocessor)),
                ("model", DecisionTreeClassifier(max_depth=None, random_state=RANDOM_STATE)),
            ]
        ),
    }
    if XGBClassifier is not None:
        xgb = Pipeline(
            [
                ("features", DomainFeatureEngineer()),
                ("cap_outliers", OutlierCapper()),
                ("prep", clone(preprocessor)),
                ("model", XGBClassifier(eval_metric="logloss", random_state=RANDOM_STATE, n_jobs=1)),
            ]
        )
        models["XGBoostCV"] = GridSearchCV(
            xgb,
            {
                "model__max_depth": [2, 3],
                "model__learning_rate": [0.05, 0.1],
                "model__n_estimators": [80, 140],
                "model__subsample": [0.8, 1.0],
            },
            cv=StratifiedKFold(n_splits=4, shuffle=True, random_state=RANDOM_STATE),
            scoring="f1",
            n_jobs=1,
        )
    return models


def reg_models(preprocessor: ColumnTransformer) -> dict[str, object]:
    selector = SelectFromModel(Lasso(alpha=0.05, random_state=RANDOM_STATE, max_iter=20000))
    models = {
        "Dummy": Pipeline(
            [
                ("features", DomainFeatureEngineer()),
                ("cap_outliers", OutlierCapper()),
                ("prep", clone(preprocessor)),
                ("model", DummyRegressor(strategy="mean")),
            ]
        ),
        "Ridge": Pipeline(
            [
                ("features", DomainFeatureEngineer()),
                ("cap_outliers", OutlierCapper()),
                ("prep", clone(preprocessor)),
                ("select", selector),
                ("model", Ridge(alpha=1.0, random_state=RANDOM_STATE)),
            ]
        ),
        "DecisionTree": Pipeline(
            [
                ("features", DomainFeatureEngineer()),
                ("cap_outliers", OutlierCapper()),
                ("prep", clone(preprocessor)),
                ("model", DecisionTreeRegressor(max_depth=None, random_state=RANDOM_STATE)),
            ]
        ),
    }
    if XGBRegressor is not None:
        xgb = Pipeline(
            [
                ("features", DomainFeatureEngineer()),
                ("cap_outliers", OutlierCapper()),
                ("prep", clone(preprocessor)),
                ("model", XGBRegressor(objective="reg:squarederror", random_state=RANDOM_STATE, n_jobs=1)),
            ]
        )
        models["XGBoostCV"] = GridSearchCV(
            xgb,
            {
                "model__max_depth": [2, 3],
                "model__learning_rate": [0.05, 0.1],
                "model__n_estimators": [120, 220],
                "model__subsample": [0.8, 1.0],
            },
            cv=4,
            scoring="neg_root_mean_squared_error",
            n_jobs=1,
        )
    return models


def evaluate_classifier(model, X, y) -> dict[str, float | list[list[int]]]:
    pred = model.predict(X)
    if hasattr(model, "predict_proba"):
        proba = model.predict_proba(X)[:, 1]
    else:
        proba = pred
    return {
        "accuracy": accuracy_score(y, pred),
        "precision": precision_score(y, pred, zero_division=0),
        "recall": recall_score(y, pred, zero_division=0),
        "f1": f1_score(y, pred, zero_division=0),
        "roc_auc": roc_auc_score(y, proba),
        "confusion_matrix": confusion_matrix(y, pred).tolist(),
    }


def evaluate_regressor(model, X, y) -> dict[str, float]:
    pred = model.predict(X)
    rmse = float(np.sqrt(mean_squared_error(y, pred)))
    return {
        "r2": r2_score(y, pred),
        "mae": mean_absolute_error(y, pred),
        "rmse": rmse,
    }


def fit_and_evaluate() -> dict[str, object]:
    df = load_dataset()
    splits = split_data(df)
    X_train, X_val, X_test, yc_train, yc_val, yc_test, yr_train, yr_val, yr_test = splits
    preprocessor = make_preprocessor(DomainFeatureEngineer().fit_transform(X_train))

    class_results = []
    fitted_class = {}
    for name, model in class_models(preprocessor).items():
        model.fit(X_train, yc_train)
        fitted_class[name] = model.best_estimator_ if hasattr(model, "best_estimator_") else model
        row = {"model": name, "split": "validation", **evaluate_classifier(fitted_class[name], X_val, yc_val)}
        row["train_f1"] = f1_score(yc_train, fitted_class[name].predict(X_train), zero_division=0)
        class_results.append(row)

    reg_results = []
    fitted_reg = {}
    for name, model in reg_models(preprocessor).items():
        model.fit(X_train, yr_train)
        fitted_reg[name] = model.best_estimator_ if hasattr(model, "best_estimator_") else model
        row = {"model": name, "split": "validation", **evaluate_regressor(fitted_reg[name], X_val, yr_val)}
        row["train_r2"] = r2_score(yr_train, fitted_reg[name].predict(X_train))
        reg_results.append(row)

    best_class_name = max(class_results, key=lambda r: r["f1"])["model"]
    best_reg_name = min(reg_results, key=lambda r: r["rmse"])["model"]
    best_class = fitted_class[best_class_name]
    best_reg = fitted_reg[best_reg_name]

    test_class = {"model": best_class_name, "split": "test", **evaluate_classifier(best_class, X_test, yc_test)}
    test_reg = {"model": best_reg_name, "split": "test", **evaluate_regressor(best_reg, X_test, yr_test)}

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    FIGURE_DIR.mkdir(parents=True, exist_ok=True)
    artifact = {
        "classifier": best_class,
        "regressor": best_reg,
        "feature_columns": X_train.columns.tolist(),
        "class_model": best_class_name,
        "reg_model": best_reg_name,
        "random_state": RANDOM_STATE,
    }
    joblib.dump(artifact, MODEL_DIR / "ev_transition_artifact.joblib")

    leaderboard_class = pd.DataFrame(class_results + [test_class])
    leaderboard_reg = pd.DataFrame(reg_results + [test_reg])
    leaderboard_class.to_csv(MODEL_DIR / "classification_leaderboard.csv", index=False)
    leaderboard_reg.to_csv(MODEL_DIR / "regression_leaderboard.csv", index=False)
    with (MODEL_DIR / "test_metrics.json").open("w", encoding="utf-8") as f:
        json.dump({"classification": test_class, "regression": test_reg}, f, indent=2)
    write_evaluation_plots(best_class, best_reg, X_train, X_val, X_test, yc_train, yc_val, yc_test, yr_test, preprocessor)

    return {
        "classification": test_class,
        "regression": test_reg,
        "class_leaderboard": leaderboard_class.to_dict(orient="records"),
        "reg_leaderboard": leaderboard_reg.to_dict(orient="records"),
    }


def write_evaluation_plots(
    best_class,
    best_reg,
    X_train,
    X_val,
    X_test,
    yc_train,
    yc_val,
    yc_test,
    yr_test,
    preprocessor,
) -> None:
    FIGURE_DIR.mkdir(parents=True, exist_ok=True)

    class_pred = best_class.predict(X_test)
    cm = confusion_matrix(yc_test, class_pred)
    fig, ax = plt.subplots(figsize=(4.5, 4))
    image = ax.imshow(cm, cmap="Greens")
    for row in range(cm.shape[0]):
        for col in range(cm.shape[1]):
            ax.text(col, row, cm[row, col], ha="center", va="center")
    fig.colorbar(image, ax=ax, fraction=0.046, pad=0.04)
    ax.set_xlabel("Predicted")
    ax.set_ylabel("Actual")
    ax.set_title("Test confusion matrix")
    fig.tight_layout()
    fig.savefig(FIGURE_DIR / "classification_confusion_matrix.png", dpi=160)
    plt.close(fig)

    reg_pred = best_reg.predict(X_test)
    fig, ax = plt.subplots(figsize=(5.5, 5))
    ax.scatter(yr_test, reg_pred, color="#4db6ac", alpha=0.7)
    lower = min(float(yr_test.min()), float(reg_pred.min()))
    upper = max(float(yr_test.max()), float(reg_pred.max()))
    ax.plot([lower, upper], [lower, upper], color="#263238", linestyle="--")
    ax.set_xlabel("Actual annual savings")
    ax.set_ylabel("Predicted annual savings")
    ax.set_title("Predicted vs actual savings")
    fig.tight_layout()
    fig.savefig(FIGURE_DIR / "predicted_vs_actual_savings.png", dpi=160)
    plt.close(fig)

    depths = list(range(1, 13))
    train_scores = []
    val_scores = []
    for depth in depths:
        tree = Pipeline(
            [
                ("features", DomainFeatureEngineer()),
                ("cap_outliers", OutlierCapper()),
                ("prep", clone(preprocessor)),
                ("model", DecisionTreeClassifier(max_depth=depth, random_state=RANDOM_STATE)),
            ]
        )
        tree.fit(X_train, yc_train)
        train_scores.append(f1_score(yc_train, tree.predict(X_train), zero_division=0))
        val_scores.append(f1_score(yc_val, tree.predict(X_val), zero_division=0))
    fig, ax = plt.subplots(figsize=(6, 4))
    ax.plot(depths, train_scores, marker="o", label="Train F1")
    ax.plot(depths, val_scores, marker="o", label="Validation F1")
    ax.set_xlabel("Decision tree max depth")
    ax.set_ylabel("F1")
    ax.set_title("Decision tree overfitting check")
    ax.legend()
    fig.tight_layout()
    fig.savefig(FIGURE_DIR / "decision_tree_overfit_curve.png", dpi=160)
    plt.close(fig)


if __name__ == "__main__":
    print(json.dumps(fit_and_evaluate(), indent=2, default=str))
