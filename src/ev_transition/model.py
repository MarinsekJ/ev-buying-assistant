from __future__ import annotations

import pandas as pd
from sklearn.base import BaseEstimator

from .features import normalize_schema


class EVTransitionPipeline(BaseEstimator):
    """Single serving asset containing full classifier and regressor pipelines."""

    def __init__(
        self,
        classifier,
        regressor,
        class_model: str,
        reg_model: str,
        feature_columns: list[str],
        random_state: int,
    ):
        self.classifier = classifier
        self.regressor = regressor
        self.class_model = class_model
        self.reg_model = reg_model
        self.feature_columns = feature_columns
        self.random_state = random_state

    def prepare_input(self, X) -> pd.DataFrame:
        return normalize_schema(pd.DataFrame(X).copy())

    def predict(self, X) -> pd.DataFrame:
        frame = self.prepare_input(X)
        return pd.DataFrame(
            {
                "Practicality_Rating": pd.Series(self.classifier.predict(frame)).astype(int),
                "Annual_Savings": pd.Series(self.regressor.predict(frame)).astype(float),
            }
        )

    def predict_proba(self, X):
        return self.classifier.predict_proba(self.prepare_input(X))

    @property
    def model_versions(self) -> dict[str, str]:
        return {"classifier": self.class_model, "regressor": self.reg_model}
