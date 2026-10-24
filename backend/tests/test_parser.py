from datetime import date
from pathlib import Path

import pytest
from conftest import html_prices

from app.collector.parser import ParseError, discover_urls, parse_document


def test_real_rosstat_publication():
    parsed = parse_document(Path("tests/fixtures/rosstat_2026_10_19.html").read_bytes())
    assert parsed.observation_date == date(2026, 10, 19)
    assert len(parsed.prices) == 255
    assert len({p.region_id for p in parsed.prices}) == 85
    assert not parsed.missing_regions
    prices = {(p.region_id, p.fuel_type): p.price_kopecks for p in parsed.prices}
    assert prices["primorsky_krai", "diesel"] == 9337
    assert prices["krasnodar_krai", "ai92"] == 7513
    assert prices["rostov_oblast", "diesel"] == 7820
    assert prices["moscow", "diesel"] == 8164
    assert prices["arkhangelsk_oblast", "diesel"] == 8476
    assert prices["tyumen_oblast", "diesel"] == 8706
    assert prices["nenets_autonomous_okrug", "diesel"] == 8943


def test_real_catalog_excludes_adjacent_nonfuel_reports():
    urls = discover_urls(
        Path("tests/fixtures/rosstat_catalog.html").read_bytes(),
        "https://rosstat.gov.ru/compendium/document/50798",
    )
    assert "https://rosstat.gov.ru/storage/mediabank/163_21-10-2026.html" in urls
    assert "https://rosstat.gov.ru/storage/mediabank/160_21-10-2026.html" not in urls
    assert "https://rosstat.gov.ru/storage/mediabank/161_21-10-2026.html" not in urls


def test_spans_and_missing_value():
    parsed = parse_document(html_prices(overrides={("primorsky_krai", "diesel"): None}))
    assert len(parsed.prices) == 254
    assert parsed.missing == ("primorsky_krai/diesel",)


def test_unit_split_by_inline_markup_in_archive():
    content = (
        html_prices()
        .decode()
        .replace("рублей за литр", '<span>рублей з</span><a id="bookmark"></a><span>а литр</span>')
    )
    parsed = parse_document(content.encode())
    assert len(parsed.prices) == 255
    assert parsed.observation_date == date(2026, 10, 19)


def test_absent_region_is_explicit_instead_of_invented():
    from app.collector.parser import soup_for

    soup = soup_for(html_prices())
    for row in soup.find_all("tr"):
        if "Челябинская область" in row.get_text():
            row.decompose()
    parsed = parse_document(str(soup).encode())
    assert parsed.missing_regions == ("chelyabinsk_oblast",)
    assert len(parsed.prices) == 252
    assert "chelyabinsk_oblast/diesel" in parsed.missing


def test_unknown_region_blocks_silent_data_loss():
    content = html_prices().decode().replace("Белгородская область", "Неизвестная область")
    with pytest.raises(ParseError, match="Unknown regional"):
        parse_document(content.encode())


@pytest.mark.parametrize(
    "old,new", [("рублей за литр", "проценты"), ("АИ-92", "АИ-91"), ("80,00", "0,00")]
)
def test_reject_structure_or_invalid_price(old, new):
    with pytest.raises(ParseError):
        parse_document(html_prices().decode().replace(old, new).encode())


def test_discovery_filters_unrelated_and_external_links():
    html = b"""<div>Other prices<a href="/storage/mediabank/x_21-10-2026.html">HTML</a></div>
    <section><h3>\xd0\x9e \xd0\xbf\xd0\xbe\xd1\x82\xd1\x80\xd0\xb5\xd0\xb1\xd0\xb8\xd1\x82\xd0\xb5\xd0\xbb\xd1\x8c\xd1\x81\xd0\xba\xd0\xb8\xd1\x85 \xd1\x86\xd0\xb5\xd0\xbd\xd0\xb0\xd1\x85 \xd0\xbd\xd0\xb0 \xd0\xbd\xd0\xb5\xd1\x84\xd1\x82\xd0\xb5\xd0\xbf\xd1\x80\xd0\xbe\xd0\xb4\xd1\x83\xd0\xba\xd1\x82\xd1\x8b</h3>
    <a href="/storage/mediabank/163_21-10-2026.html">HTML</a><a href="https://evil.test/storage/mediabank/x.html">bad</a></section>"""
    urls = discover_urls(b'<meta charset="utf-8">' + html, "https://rosstat.gov.ru/catalog")
    assert urls == ["https://rosstat.gov.ru/storage/mediabank/163_21-10-2026.html"]
