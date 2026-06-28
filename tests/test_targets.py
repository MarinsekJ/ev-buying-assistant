from ev_transition.data import generate_synthetic_ev_dataset
from ev_transition.features import derive_targets


def test_derived_targets_are_present_and_bounded():
    df = generate_synthetic_ev_dataset(n_rows=50)
    assert "Practicality_Rating" in df
    assert "Annual_Savings" in df
    assert set(df["Practicality_Rating"].unique()).issubset({0, 1})


def test_lower_utility_rate_improves_savings():
    high_rate = derive_targets(
        generate_synthetic_ev_dataset(n_rows=1).assign(Utility_Rate_per_kWh=0.35)
    )["Annual_Savings"].iloc[0]
    low_rate = derive_targets(
        generate_synthetic_ev_dataset(n_rows=1).assign(Utility_Rate_per_kWh=0.10)
    )["Annual_Savings"].iloc[0]
    assert low_rate > high_rate

