from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel

Fuel = Literal["diesel", "ai92", "ai95"]


class Period(BaseModel):
    from_: date
    to: date


class Dates(BaseModel):
    start: date
    end: date


class PricePoint(BaseModel):
    date: date
    price_kopecks: int
    source_id: str


class Summary(BaseModel):
    latest_price_kopecks: int | None
    min_price_kopecks: int | None
    max_price_kopecks: int | None
    change_kopecks: int | None
    change_percent: str | None


class Envelope(BaseModel):
    schema_version: str = "1"
    dataset_version: str
    generated_at: datetime
    warnings: list[str]


class PriceResponse(Envelope):
    region_id: str
    fuel_type: Fuel
    requested_period: dict[str, date]
    actual_period: dict[str, date] | None
    expected_dates: list[date]
    missing_dates: list[date]
    observations: list[PricePoint]
    summary: Summary


class ComparisonRow(BaseModel):
    region_id: str
    price_kopecks: int
    difference_kopecks: int
    difference_percent: str
    change_kopecks: int | None
    change_percent: str | None


class ComparisonResponse(Envelope):
    fuel_type: Fuel
    base_region: str
    requested_period: dict[str, date]
    actual_period: dict[str, date] | None
    common_dates: list[date]
    comparison_start: date | None
    comparison_end: date | None
    comparable: bool
    reason: str | None
    series: list[PriceResponse]
    rows: list[ComparisonRow]


class NamedItem(BaseModel):
    id: str
    name: str


class RegionInfo(NamedItem):
    price_area: str | None = None
    available: bool


class SourceInfo(BaseModel):
    id: str
    url: str
    sha256: str
    published_date: date
    observation_date: date


class Coverage(BaseModel):
    region_id: str
    fuel_type: Fuel
    first_observation_date: date | None
    latest_observation_date: date | None
    count: int
    missing_dates: list[date]
    stale: bool
    available: bool


class MetaResponse(Envelope):
    active_version: str
    published_at: datetime
    regions: list[RegionInfo]
    fuel_types: list[NamedItem]
    expected_dates: list[date]
    coverage: list[Coverage]
    sources: list[SourceInfo]
    last_successful_check_at: datetime | None
    last_published_at: datetime | None
    update_status: str
    source_tls_verified: bool | None
