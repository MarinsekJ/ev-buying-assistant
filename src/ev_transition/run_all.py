from __future__ import annotations

from .eda import build_report_assets
from .train import fit_and_evaluate


def main() -> None:
    build_report_assets()
    results = fit_and_evaluate()
    build_report_assets()
    print("Workflow complete.")
    print(results)


if __name__ == "__main__":
    main()

