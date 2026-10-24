from datetime import date

import httpx
import pytest

from app.collector.source import SourceClient, SourceError, validate_url
from app.config import Settings
from app.domain import cost_kopecks, expected_weeks, percent


@pytest.mark.parametrize(
    "url",
    [
        "http://rosstat.gov.ru/x",
        "https://evil.test/x",
        "https://rosstat.gov.ru@evil.test/x",
        "https://rosstat.gov.ru:8443/x",
        "https://user:pass@rosstat.gov.ru/x",
    ],
)
def test_source_allowlist(url):
    with pytest.raises(SourceError):
        validate_url(url)


def test_redirect_does_not_escape_allowlist():
    client = SourceClient(
        Settings(_env_file=None, rosstat_verify_tls=False),
        transport=httpx.MockTransport(
            lambda _r: httpx.Response(302, headers={"Location": "https://evil.test/x"})
        ),
    )
    try:
        with pytest.raises(SourceError, match="SOURCE_URL_NOT_ALLOWED"):
            client.get("https://rosstat.gov.ru/x")
    finally:
        client.close()


def test_oversized_document_rejected():
    client = SourceClient(
        Settings(_env_file=None, max_document_bytes=3),
        transport=httpx.MockTransport(lambda _r: httpx.Response(200, content=b"1234")),
    )
    try:
        with pytest.raises(SourceError, match="DOCUMENT_TOO_LARGE"):
            client.get("https://rosstat.gov.ru/x")
    finally:
        client.close()


def test_decimal_money():
    assert cost_kopecks("600", 8000) == 4800000
    assert cost_kopecks("600", 8200) - cost_kopecks("600", 8000) == 120000
    assert cost_kopecks("0.05", 1) == 0
    assert cost_kopecks("0.50", 1) == 1
    assert percent(8200, 8000) == "2.50"


def test_holiday_observation_does_not_create_a_false_monday_gap():
    dates = [date(2026, 2, 16), date(2026, 2, 24), date(2026, 3, 10)]
    assert expected_weeks(dates) == [
        date(2026, 2, 16), date(2026, 2, 24), date(2026, 3, 2), date(2026, 3, 10)
    ]
