from conftest import doc
from fastapi.testclient import TestClient

from app.collector.service import ingest_documents
from app.config import Settings
from app.main import create_app


def parameters(version, **overrides):
    return {
        "region": "primorsky_krai",
        "fuel": "diesel",
        "from": "2026-10-01",
        "to": "2026-10-31",
        "dataset_version": version,
        **overrides,
    }


def test_meta_prices_and_source_provenance(client, published):
    meta = client.get("/api/v1/meta").json()
    assert meta["dataset_version"] == published
    assert len(meta["regions"]) == 85
    assert len(meta["coverage"]) == 255
    response = client.get("/api/v1/prices", params=parameters(published))
    assert response.status_code == 200
    payload = response.json()
    assert payload["actual_period"] == {"from": "2026-10-12", "to": "2026-10-12"}
    assert payload["summary"]["change_percent"] is None
    assert payload["observations"][0]["source_id"] == meta["sources"][0]["id"]
    assert response.headers["x-request-id"]


def test_regions_and_price_areas_are_explicit(client):
    regions = {r["id"]: r for r in client.get("/api/v1/meta").json()["regions"]}
    assert len(regions) == 85
    assert all(r["available"] for r in regions.values())
    assert "без Ненецкого" in regions["arkhangelsk_oblast"]["price_area"]
    assert regions["nenets_autonomous_okrug"]["price_area"] is None


def test_no_data_region_is_not_reported_as_zero_or_stale(settings):
    from app.operations import decide

    result = ingest_documents(
        settings,
        [doc(overrides={("chelyabinsk_oblast", f): None for f in ("diesel", "ai92", "ai95")})],
    )
    version = result["dataset_version"]
    decide(settings, version, "publish", "Missing source values checked", "pytest")
    with TestClient(create_app(settings)) as client:
        meta = client.get("/api/v1/meta").json()
        region = next(r for r in meta["regions"] if r["id"] == "chelyabinsk_oblast")
        assert region["available"] is False
        coverage = [c for c in meta["coverage"] if c["region_id"] == "chelyabinsk_oblast"]
        assert all(not c["available"] and not c["stale"] for c in coverage)
        response = client.get(
            "/api/v1/prices", params=parameters(version, region="chelyabinsk_oblast")
        )
        assert response.status_code == 200
        assert response.json()["observations"] == []
        assert "NO_DATA_FOR_REGION_FUEL" in response.json()["warnings"]


def test_new_version_does_not_mutate_pinned_queries(settings, client, published):
    result = ingest_documents(
        settings, [doc(overrides={("primorsky_krai", "diesel"): 8200})], mode="incremental"
    )
    assert result["status"] == "published"
    new = result["dataset_version"]
    assert client.get("/api/v1/meta").json()["dataset_version"] == new
    assert (
        len(client.get("/api/v1/prices", params=parameters(published)).json()["observations"]) == 1
    )
    payload = client.get("/api/v1/prices", params=parameters(new)).json()
    assert payload["summary"]["change_percent"] == "2.50"
    assert payload["summary"]["change_kopecks"] == 200


def test_comparison_uses_intersection(settings, client, published):
    result = ingest_documents(settings, [doc(overrides={("rostov_oblast", "diesel"): None})])
    params = parameters(result["dataset_version"])
    params.pop("region")
    params.update(regions=["primorsky_krai", "rostov_oblast"], base_region="primorsky_krai")
    payload = client.get("/api/v1/comparison", params=params).json()
    assert payload["common_dates"] == ["2026-10-12"]
    assert payload["comparison_end"] == "2026-10-12"
    assert payload["reason"] == "ONE_COMMON_DATE"
    assert all(row["change_percent"] is None for row in payload["rows"])


def test_empty_period_returns_empty_not_zero(client, published):
    response = client.get(
        "/api/v1/prices", params=parameters(published, **{"from": "2026-01-01", "to": "2026-01-07"})
    )
    assert response.status_code == 200
    assert response.json()["actual_period"] is None
    assert response.json()["summary"]["latest_price_kopecks"] is None


def test_invalid_requests(client, published):
    for overrides, status in [
        ({"region": "nope"}, 404),
        ({"fuel": "kerosene"}, 422),
        ({"dataset_version": "missing"}, 404),
        ({"from": "2027-01-01"}, 422),
    ]:
        response = client.get("/api/v1/prices", params=parameters(published, **overrides))
        assert response.status_code == status
        assert "request_id" in response.json()
    params = parameters(published)
    params.pop("dataset_version")
    assert client.get("/api/v1/prices", params=params).status_code == 422


def test_health_before_database_exists(tmp_path):
    with TestClient(create_app(Settings(_env_file=None, data_dir=tmp_path))) as client:
        assert client.get("/health/live").status_code == 200
        assert client.get("/health/ready").status_code == 503


def test_api_is_read_only_and_cors(settings, published):
    with TestClient(create_app(settings)) as client:
        assert client.post("/api/v1/prices").status_code == 405
        response = client.get("/api/v1/meta", headers={"Origin": "http://localhost:5173"})
        assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_rate_limit(settings, published):
    settings.rate_limit_per_minute = 1
    with TestClient(create_app(settings)) as client:
        assert client.get("/api/v1/meta").status_code == 200
        limited = client.get("/api/v1/meta", headers={"Origin": "http://localhost:5173"})
        assert limited.status_code == 429
        assert limited.headers["access-control-allow-origin"] == "http://localhost:5173"
        assert client.get("/health/live").status_code == 200


def test_comparison_accepts_five_regions_and_rejects_six(client, published):
    params = parameters(published)
    params.pop("region")
    regions = [
        "primorsky_krai",
        "khabarovsk_krai",
        "amur_oblast",
        "rostov_oblast",
        "sakhalin_oblast",
    ]
    params.update(base_region=regions[0], regions=regions)
    response = client.get("/api/v1/comparison", params=params)
    assert response.status_code == 200
    assert [row["region_id"] for row in response.json()["rows"]] == regions
    assert len(response.json()["series"]) == 5
    params["regions"] = [*regions, "moscow"]
    assert client.get("/api/v1/comparison", params=params).status_code == 422
    params["regions"] = [regions[0], *regions[:4]]
    assert (
        client.get("/api/v1/comparison", params=params).json()["error"]["code"] == "INVALID_REGIONS"
    )


def test_five_regions_use_the_last_common_date(settings, client, published):
    result = ingest_documents(settings, [doc(overrides={("rostov_oblast", "diesel"): None})])
    params = parameters(result["dataset_version"])
    params.pop("region")
    params.update(
        base_region="primorsky_krai",
        regions=[
            "primorsky_krai",
            "khabarovsk_krai",
            "amur_oblast",
            "rostov_oblast",
            "sakhalin_oblast",
        ],
    )
    response = client.get("/api/v1/comparison", params=params)
    assert response.status_code == 200
    assert response.json()["comparison_end"] == "2026-10-12"
    assert len(response.json()["rows"]) == 5
