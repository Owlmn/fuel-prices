from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import FUELS, REGIONS, Settings
from app.domain import percent, summary
from app.models import DatasetState, DatasetVersion, ImportRun, Observation, SourceDocument
from app.regions import PRICE_AREAS


class QueryError(Exception):
    def __init__(self, status: int, code: str):
        self.status, self.code = status, code


def iso_time(value: datetime | None):
    if value is None:
        return None
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


def resolve_version(session: Session, key: str | None) -> DatasetVersion:
    state = session.get(DatasetState, 1)
    if key is None:
        if state is None or state.active_version_id is None:
            raise QueryError(503, "NO_PUBLISHED_DATA")
        key = state.active_version_id
    version = session.get(DatasetVersion, key)
    if version is None or version.state != "published":
        raise QueryError(404, "DATASET_NOT_FOUND")
    return version


def envelope(version: DatasetVersion, warnings=None):
    return dict(
        schema_version=version.schema_version,
        dataset_version=version.id,
        generated_at=datetime.now(UTC),
        warnings=warnings or [],
    )


def price_response(
    session: Session,
    version: DatasetVersion,
    region: str,
    fuel: str,
    start: date,
    end: date,
    settings: Settings,
) -> dict:
    if region not in REGIONS:
        raise QueryError(404, "REGION_NOT_FOUND")
    rows = list(
        session.scalars(
            select(Observation)
            .where(
                Observation.dataset_version == version.id,
                Observation.region_id == region,
                Observation.fuel_type == fuel,
                Observation.observation_date >= start,
                Observation.observation_date <= end,
            )
            .order_by(Observation.observation_date)
        )
    )
    points = [
        dict(date=r.observation_date, price_kopecks=r.price_kopecks, source_id=r.source_id)
        for r in rows
    ]
    expected = [
        date.fromisoformat(d)
        for d in version.expected_dates
        if start <= date.fromisoformat(d) <= end
    ]
    present = {p["date"] for p in points}
    missing = [d for d in expected if d not in present]
    warnings = ["INCOMPLETE_PERIOD"] if missing else []
    if len(points) < 2:
        warnings.append("INSUFFICIENT_POINTS")
    all_rows = list(
        session.scalars(
            select(Observation.observation_date).where(
                Observation.dataset_version == version.id,
                Observation.region_id == region,
                Observation.fuel_type == fuel,
            )
        )
    )
    if all_rows and (date.today() - max(all_rows)).days > settings.freshness_days:
        warnings.append("STALE_DATA")
    if not all_rows:
        warnings.append("NO_DATA_FOR_REGION_FUEL")
    return {
        **envelope(version, warnings),
        "region_id": region,
        "fuel_type": fuel,
        "requested_period": {"from": start, "to": end},
        "actual_period": {"from": points[0]["date"], "to": points[-1]["date"]} if points else None,
        "expected_dates": expected,
        "missing_dates": missing,
        "observations": points,
        "summary": summary(points),
    }


def comparison_response(session, version, regions, base_region, fuel, start, end, settings):
    series = [price_response(session, version, r, fuel, start, end, settings) for r in regions]
    indexed = {
        s["region_id"]: {p["date"]: p["price_kopecks"] for p in s["observations"]} for s in series
    }
    common = sorted(set.intersection(*(set(x) for x in indexed.values())))
    rows = []
    if common:
        first, last = common[0], common[-1]
        base = indexed[base_region][last]
        for region in regions:
            old, new = indexed[region][first], indexed[region][last]
            rows.append(
                dict(
                    region_id=region,
                    price_kopecks=new,
                    difference_kopecks=new - base,
                    difference_percent=percent(new, base),
                    change_kopecks=new - old if len(common) > 1 else None,
                    change_percent=percent(new, old) if len(common) > 1 else None,
                )
            )
    return {
        **envelope(version, sorted({w for s in series for w in s["warnings"]})),
        "fuel_type": fuel,
        "base_region": base_region,
        "requested_period": {"from": start, "to": end},
        "actual_period": {"from": common[0], "to": common[-1]} if common else None,
        "common_dates": common,
        "comparison_start": common[0] if common else None,
        "comparison_end": common[-1] if common else None,
        "comparable": bool(common),
        "reason": None if len(common) > 1 else "ONE_COMMON_DATE" if common else "NO_COMMON_DATES",
        "series": series,
        "rows": rows,
    }


def meta_response(session, version, settings):
    state = session.get(DatasetState, 1)
    active = session.get(DatasetVersion, state.active_version_id)
    observations = list(
        session.scalars(select(Observation).where(Observation.dataset_version == version.id))
    )
    expected = [date.fromisoformat(d) for d in version.expected_dates]
    source_ids = {r.source_id for r in observations}
    sources = list(
        session.scalars(
            select(SourceDocument)
            .where(SourceDocument.id.in_(source_ids))
            .order_by(SourceDocument.observation_date)
        )
    )
    coverage = []
    grouped_dates = {}
    for observation in observations:
        grouped_dates.setdefault((observation.region_id, observation.fuel_type), []).append(
            observation.observation_date
        )
    for region in REGIONS:
        for fuel in FUELS:
            dates = sorted(grouped_dates.get((region, fuel), []))
            coverage.append(
                dict(
                    region_id=region,
                    fuel_type=fuel,
                    first_observation_date=dates[0] if dates else None,
                    latest_observation_date=dates[-1] if dates else None,
                    count=len(dates),
                    missing_dates=sorted(set(expected) - set(dates)),
                    stale=bool(dates) and (date.today() - dates[-1]).days > settings.freshness_days,
                    available=bool(dates),
                )
            )
    successful = session.scalar(
        select(ImportRun)
        .where(
            ImportRun.status.in_(["published", "no_changes", "needs_review"]),
            ImportRun.mode == "incremental",
        )
        .order_by(ImportRun.finished_at.desc())
        .limit(1)
    )
    latest_run = session.scalar(select(ImportRun).order_by(ImportRun.started_at.desc()).limit(1))
    last_check = iso_time(successful.finished_at) if successful else None
    warnings = []
    if (
        last_check is None
        or (datetime.now(UTC) - last_check).total_seconds() > settings.check_freshness_hours * 3600
    ):
        warnings.append("SOURCE_CHECK_OVERDUE")
    if any(c["stale"] for c in coverage):
        warnings.append("STALE_DATA")
    if any(not c["available"] for c in coverage):
        warnings.append("NO_DATA_FOR_SOME_REGION_FUELS")
    available_regions = {row.region_id for row in observations}
    return {
        **envelope(version, warnings),
        "active_version": active.id,
        "published_at": iso_time(version.published_at),
        "regions": [
            dict(id=k, name=v, price_area=PRICE_AREAS.get(k), available=k in available_regions)
            for k, v in sorted(REGIONS.items(), key=lambda pair: pair[1])
        ],
        "fuel_types": [dict(id=k, name=v) for k, v in FUELS.items()],
        "expected_dates": expected,
        "coverage": coverage,
        "sources": [
            dict(
                id=s.id,
                url=s.url,
                sha256=s.sha256,
                published_date=s.published_date,
                observation_date=s.observation_date,
            )
            for s in sources
        ],
        "last_successful_check_at": last_check,
        "last_published_at": iso_time(active.published_at),
        "update_status": latest_run.status if latest_run else "never_checked",
        "source_tls_verified": latest_run.report.get("tls_verified") if latest_run else None,
    }
