from __future__ import annotations

import json
import sys
import traceback

from .predict import predict_from_payload


def main() -> None:
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            payload = json.loads(line)
            request_payload = {key: value for key, value in payload.items() if key != "id"}
            result = predict_from_payload(request_payload)
            response = {"id": payload.get("id"), "ok": True, "prediction": result}
        except Exception as exc:
            response = {
                "id": payload.get("id") if "payload" in locals() else None,
                "ok": False,
                "error": str(exc),
                "traceback": traceback.format_exc(limit=4),
            }
        sys.stdout.write(json.dumps(response) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
