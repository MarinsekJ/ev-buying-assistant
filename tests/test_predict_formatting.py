from ev_transition.predict import predict
from ev_transition.model import EVTransitionPipeline


class StubRegressor:
    def predict(self, X):
        return [1234.56]


class StubClassifier:
    def predict(self, X):
        return [1]

    def predict_proba(self, X):
        return [[0.1, 0.9]]


def test_predict_returns_clean_formatted_annual_savings(monkeypatch, tmp_path):

    artifact_path = tmp_path / "ev_transition_artifact.joblib"

    import joblib

    pipeline = EVTransitionPipeline(
        classifier=StubClassifier(),
        regressor=StubRegressor(),
        class_model="test-classifier",
        reg_model="test-regressor",
        feature_columns=["State", "Weekly_Commute_Miles", "Utility_Rate_per_kWh"],
        random_state=42,
    )
    joblib.dump(pipeline, artifact_path)

    monkeypatch.setenv("MODEL_DIR", str(tmp_path))

    result = predict(weekly_commute_miles=100, state="CA", utility_rate=0.18)

    assert result["formatted_annual_savings"] == "$1,235"
    assert result["gas_price_per_gallon"] == 5.05
