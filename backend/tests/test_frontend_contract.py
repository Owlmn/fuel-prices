import json
from datetime import date, timedelta
from pathlib import Path

from conftest import doc
from fastapi.testclient import TestClient

from app.collector.service import ingest_documents
from app.main import create_app
from app.operations import decide


def test_shared_comparison_contract(settings):
    fixture = json.loads(
        (Path(__file__).parents[2] / "shared" / "comparison-cases.json").read_text(encoding="utf-8")
    )
    documents = []
    for observation in fixture["observations"]:
        day = date.fromisoformat(observation["date"])
        documents.append(
            doc(
                day=f"{day.day} октября",
                published=day + timedelta(days=2),
                overrides={
                    (region, "diesel"): price for region, price in observation["prices"].items()
                },
            )
        )
    version = ingest_documents(settings, documents)["dataset_version"]
    decide(settings, version, "publish", "Shared synthetic contract fixture", "pytest")
    with TestClient(create_app(settings)) as client:
        for case in fixture["cases"]:
            response = client.get(
                "/api/v1/comparison",
                params={
                    "base_region": "primorsky_krai",
                    "regions": ["primorsky_krai", *case["compare"]],
                    "fuel": "diesel",
                    "dataset_version": version,
                    "from": case["from"],
                    "to": case["to"],
                },
            )
            assert response.status_code == 200
            result = response.json()
            for field in ("common_dates", "reason", "rows"):
                assert result[field] == case[field], case["name"]
