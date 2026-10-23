from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.collector.service import ingest_documents
from app.collector.source import Downloaded
from app.config import REGIONS, Settings
from app.main import create_app
from app.migrate import migrate
from app.operations import decide
from app.regions import SOURCE_LABELS


def html_prices(day="19 октября", overrides=None):
    overrides = overrides or {}
    rows = []
    for region, name in REGIONS.items():
        name = SOURCE_LABELS.get(region, (name,))[0]
        cells = []
        for fuel in ("ai92", "ai95", "diesel"):
            value = overrides.get((region, fuel), 8000)
            cells.append("..." if value is None else f"{value // 100},{value % 100:02}")
        rows.append(
            f"<tr><td>{name}</td><td>79,00</td><td>{cells[0]}</td><td>{cells[1]}</td><td>99,00</td><td>{cells[2]}</td></tr>"
        )
    return (
        f"<html><meta charset='utf-8'><p>Средние потребительские цены на бензин автомобильный и дизельное топливо на {day} 2026 года</p>"
        "<p>рублей за литр</p><table><tr><td rowspan='2'></td><td rowspan='2'>Бензин</td><td colspan='3'>В том числе</td><td rowspan='2'>Дизельное топливо</td></tr>"
        "<tr><td>марки АИ-92</td><td>марки АИ-95</td><td>АИ-98</td></tr>"
        + "".join(rows)
        + "</table></html>"
    ).encode()


def doc(day="19 октября", published=date(2026, 10, 21), overrides=None):
    return Downloaded(
        f"https://rosstat.gov.ru/storage/mediabank/test_{published:%d-%m-%Y}.html",
        html_prices(day, overrides),
        published,
    )


@pytest.fixture
def settings(tmp_path):
    settings = Settings(
        _env_file=None, data_dir=tmp_path, min_free_disk_mb=0, rate_limit_per_minute=1000
    )
    migrate(settings)
    return settings


@pytest.fixture
def published(settings):
    result = ingest_documents(settings, [doc(day="12 октября", published=date(2026, 10, 14))])
    version = result["dataset_version"]
    decide(settings, version, "publish", "Synthetic fixture checked", "pytest")
    return version


@pytest.fixture
def client(settings, published):
    with TestClient(create_app(settings)) as client:
        yield client
