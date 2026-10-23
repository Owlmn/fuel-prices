import re
import warnings
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation
from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup, XMLParsedAsHTMLWarning

from app.config import REGIONS
from app.regions import AGGREGATE_LABELS, SOURCE_LABELS

MONTHS = {
    "января": 1,
    "февраля": 2,
    "марта": 3,
    "апреля": 4,
    "мая": 5,
    "июня": 6,
    "июля": 7,
    "августа": 8,
    "сентября": 9,
    "октября": 10,
    "ноября": 11,
    "декабря": 12,
}
DATE_RE = re.compile(r"на\s+(\d{1,2})\s+(" + "|".join(MONTHS) + r")\s+(\d{4})\s*г")


class ParseError(ValueError):
    pass


def normalized(value: str) -> str:
    return (
        re.sub(r"\s+", " ", re.sub(r"[\u2010-\u2015]", "-", value.replace("\xa0", " ")))
        .strip()
        .lower()
    )


def soup_for(content: bytes) -> BeautifulSoup:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", XMLParsedAsHTMLWarning)
        return BeautifulSoup(content, "lxml")


@dataclass(frozen=True)
class ParsedPrice:
    region_id: str
    fuel_type: str
    price_kopecks: int
    source_row: str


@dataclass(frozen=True)
class ParsedDocument:
    observation_date: date
    prices: tuple[ParsedPrice, ...]
    missing: tuple[str, ...]
    missing_regions: tuple[str, ...] = ()


def source_region_names() -> dict[str, str]:
    return {
        normalized(label): key
        for key, name in REGIONS.items()
        for label in SOURCE_LABELS.get(key, (name,))
    }


def region_row_key(value: str) -> str:
    return re.sub(r"^в том числе:\s*", "", normalized(value))


def expand_table(table) -> list[list[str]]:
    """Account for both rowspan and colspan instead of fixed cell offsets."""
    grid = []
    pending: dict[tuple[int, int], str] = {}
    for r, row in enumerate(table.find_all("tr")):
        col = 0
        for cell in row.find_all(["td", "th"], recursive=False):
            while (r, col) in pending:
                col += 1
            text = normalized(cell.get_text(" ", strip=True))
            height, width = int(cell.get("rowspan", 1)), int(cell.get("colspan", 1))
            if not (1 <= height <= 50 and 1 <= width <= 30):
                raise ParseError("Unexpected table span")
            for dr in range(height):
                for dc in range(width):
                    pending[r + dr, col + dc] = text
            col += width
        columns = [c for rr, c in pending if rr == r]
        grid.append([pending.get((r, c), "") for c in range(max(columns, default=-1) + 1)])
    return grid


def parse_document(content: bytes) -> ParsedDocument:
    soup = soup_for(content)
    names = source_region_names()
    candidates = [
        t
        for t in soup.find_all("table")
        if sum(name in normalized(t.get_text(" ", strip=True)) for name in names) >= 2
    ]
    if len(candidates) != 1:
        raise ParseError("Cannot uniquely identify regional price table")
    table = candidates[0]
    preceding = []
    for el in table.find_all_previous(["p", "h1", "h2", "h3"]):
        preceding.append(normalized(el.get_text(" ", strip=True)))
        if len(preceding) >= 12:
            break
    context = " ".join(reversed(preceding))
    dates = list(DATE_RE.finditer(context))
    if (
        "средние потребительские цены" not in context
        or not dates
        or "рублей за литр" not in context
    ):
        raise ParseError("Missing regional absolute-price caption/date/unit")
    match = dates[-1]
    observation_date = date(int(match[3]), MONTHS[match[2]], int(match[1]))
    grid = expand_table(table)
    header_end = next(
        (i for i, row in enumerate(grid) if row and region_row_key(row[0]) in names), None
    )
    if header_end is None:
        raise ParseError("No supported region rows")
    headers = grid[: min(header_end, 3)]
    columns = {}
    for col in range(max(map(len, headers), default=0)):
        text = " ".join(row[col] for row in headers if col < len(row))
        if re.search(r"аи\s*-?\s*92", text):
            columns["ai92"] = col
        if re.search(r"аи\s*-?\s*95", text):
            columns["ai95"] = col
        if "дизельное" in text and "топливо" in text:
            columns["diesel"] = col
    if set(columns) != {"diesel", "ai92", "ai95"}:
        raise ParseError("Fuel headers changed")
    prices, missing, seen_regions, seen_values = [], [], set(), set()
    aggregates = {normalized(label) for label in AGGREGATE_LABELS}
    for row in grid:
        if not row:
            continue
        key_name = region_row_key(row[0])
        if key_name not in names:
            if (
                key_name
                and not key_name.startswith(("*", "российская федерация"))
                and "федеральный округ" not in key_name
                and key_name not in aggregates
                and len(row) >= 6
                and re.match(r"\d", row[1] or "")
            ):
                raise ParseError(f"Unknown regional price row: {row[0]}")
            continue
        region = names[key_name]
        if region in seen_regions:
            raise ParseError("Duplicate regional row")
        seen_regions.add(region)
        for fuel, col in columns.items():
            if col >= len(row):
                raise ParseError("Truncated regional row")
            value = row[col]
            key = (region, fuel)
            if key in seen_values:
                raise ParseError("Duplicate price")
            seen_values.add(key)
            if value in {"", "...", "…", "-", "—", "–"}:
                missing.append(f"{region}/{fuel}")
                continue
            try:
                number = Decimal(value.replace(" ", "").replace(",", "."))
            except InvalidOperation as exc:
                raise ParseError("Invalid price") from exc
            if (
                not number.is_finite()
                or number <= 0
                or number * 100 != (number * 100).to_integral_value()
            ):
                raise ParseError("Price must be positive with at most 2 decimal places")
            prices.append(ParsedPrice(region, fuel, int(number * 100), row[0]))
    absent = tuple(sorted(set(REGIONS) - seen_regions))
    missing.extend(f"{region}/{fuel}" for region in absent for fuel in columns)
    return ParsedDocument(observation_date, tuple(prices), tuple(missing), absent)


def discover_urls(content: bytes, catalog_url: str) -> list[str]:
    soup = soup_for(content)
    candidates = []
    for a in soup.find_all("a", href=True):
        url = urljoin(catalog_url, a["href"])
        parts = urlsplit(url)
        if (
            parts.hostname not in {"rosstat.gov.ru", "www.rosstat.gov.ru"}
            or not parts.path.startswith("/storage/mediabank/")
            or not parts.path.lower().endswith((".html", ".htm"))
        ):
            continue
        # Inspect the document's own row, never its whole monthly list: otherwise
        # an unrelated inflation report inherits a fuel title from a neighbouring row.
        container = a.find_parent(class_="document-list__item")
        if container is None:
            container = a.find_parent("tr") or a.find_parent(["section", "div"])
        if container is not None:
            text = normalized(container.get_text(" ", strip=True))
            if len(text) < 1500 and "о потребительских ценах на нефтепродукты" in text:
                candidates.append(url)
    return sorted(set(candidates))
