import hashlib
import json
import logging
import os
import shutil
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

from sqlalchemy import select

from app.collector.parser import discover_urls, parse_document
from app.collector.source import Downloaded, SourceClient, SourceError, publication_date
from app.config import CATALOG_URL, Settings
from app.db import session_for
from app.domain import expected_weeks
from app.locking import writer_lock
from app.models import DatasetState, DatasetVersion, ImportRun, Observation, SourceDocument, utcnow

log = logging.getLogger(__name__)


def recover_interrupted_runs(session):
    # Called only while holding the common writer lock: no other collector can be alive.
    for previous in session.scalars(select(ImportRun).where(ImportRun.status == "running")):
        previous.status, previous.finished_at = "failed", utcnow()
        previous.report = {"error_code": "INTERRUPTED"}
    session.commit()


def check_disk(settings: Settings):
    if shutil.disk_usage(settings.data_dir).free < settings.min_free_disk_mb * 1024**2:
        raise SourceError("LOW_DISK")


def save_original(settings: Settings, content: bytes) -> tuple[str, str]:
    check_disk(settings)
    digest = hashlib.sha256(content).hexdigest()
    relative = Path("originals") / f"{digest}.html"
    target = settings.data_dir / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        temp = target.with_suffix(".tmp")
        temp.write_bytes(content)
        os.replace(temp, target)
    return digest, relative.as_posix()


def stage(
    session, settings: Settings, run: ImportRun, documents: list[Downloaded]
) -> DatasetVersion | None:
    """A whole candidate snapshot; no mutation of a previously published version."""
    if not documents:
        raise SourceError("EMPTY_IMPORT")
    state = session.get(DatasetState, 1)
    parent = (
        session.get(DatasetVersion, state.active_version_id)
        if state and state.active_version_id
        else None
    )
    old = {}
    if parent:
        for row in session.scalars(
            select(Observation).where(Observation.dataset_version == parent.id)
        ):
            old[row.region_id, row.fuel_type, row.observation_date] = dict(
                region_id=row.region_id,
                fuel_type=row.fuel_type,
                observation_date=row.observation_date,
                price_kopecks=row.price_kopecks,
                source_id=row.source_id,
                source_row=row.source_row,
            )
    merged = dict(old)
    dates = {date.fromisoformat(d) for d in parent.expected_dates} if parent else set()
    issues, missing = [], []
    seen_dates = set()
    for doc in sorted(documents, key=lambda d: (d.published_date, d.url)):
        parsed = parse_document(doc.content)
        if parsed.observation_date > doc.published_date:
            raise SourceError("OBSERVATION_AFTER_PUBLICATION")
        if parsed.observation_date in seen_dates:
            raise SourceError("CONFLICTING_DOCUMENT_DATES")
        seen_dates.add(parsed.observation_date)
        digest, path = save_original(settings, doc.content)
        source = session.scalar(
            select(SourceDocument).where(
                SourceDocument.url == doc.url, SourceDocument.sha256 == digest
            )
        )
        if source is None:
            source = SourceDocument(
                url=doc.url,
                sha256=digest,
                published_date=doc.published_date,
                observation_date=parsed.observation_date,
                storage_path=path,
            )
            session.add(source)
            session.flush()
        # Replace the full day's supported slice, so removed/missing values do not silently survive.
        for key in [k for k in merged if k[2] == parsed.observation_date]:
            del merged[key]
        dates.add(parsed.observation_date)
        missing.extend(f"{parsed.observation_date}:{m}" for m in parsed.missing)
        for region in parsed.missing_regions:
            issues.append(
                {
                    "code": "SOURCE_REGION_ABSENT",
                    "region": region,
                    "date": parsed.observation_date.isoformat(),
                }
            )
        for price in parsed.prices:
            key = price.region_id, price.fuel_type, parsed.observation_date
            merged[key] = dict(
                region_id=price.region_id,
                fuel_type=price.fuel_type,
                observation_date=parsed.observation_date,
                price_kopecks=price.price_kopecks,
                source_id=source.id,
                source_row=price.source_row,
            )
    changed = {
        k for k in old if k not in merged or old[k]["price_kopecks"] != merged[k]["price_kopecks"]
    }
    for k in sorted(changed):
        issues.append(
            {"code": "HISTORICAL_REVISION", "region": k[0], "fuel": k[1], "date": k[2].isoformat()}
        )
    groups = {}
    for key, row in sorted(merged.items()):
        groups.setdefault(key[:2], []).append(row)
    for (region, fuel), rows in groups.items():
        rows.sort(key=lambda r: r["observation_date"])
        for a, b in zip(rows, rows[1:], strict=False):
            delta = abs(Decimal(b["price_kopecks"] - a["price_kopecks"]) / a["price_kopecks"] * 100)
            if b["observation_date"] - a["observation_date"] != timedelta(days=7):
                continue
            # Previously accepted history is not re-flagged on every subsequent run.
            key = region, fuel, b["observation_date"]
            if delta > settings.anomaly_percent and (key not in old or key in changed):
                issues.append(
                    {
                        "code": "PRICE_JUMP",
                        "region": region,
                        "fuel": fuel,
                        "date": b["observation_date"].isoformat(),
                        "percent": str(delta),
                    }
                )
    if parent and merged == old and sorted(d.isoformat() for d in dates) == parent.expected_dates:
        return None
    report = {
        "issues": issues,
        "missing": missing,
        "observations": len(merged),
        "new_observations": len(set(merged) - set(old)),
        "changed_observations": len(changed),
    }
    fingerprint = hashlib.sha256(
        json.dumps(
            {
                "parent": parent.id if parent else None,
                "rows": [merged[k] for k in sorted(merged)],
                "dates": sorted(d.isoformat() for d in dates),
            },
            sort_keys=True,
            default=str,
        ).encode()
    ).hexdigest()
    previous_candidate = session.scalar(
        select(DatasetVersion).where(
            DatasetVersion.state.in_(["candidate", "needs_review"]),
            DatasetVersion.report["fingerprint"].as_string() == fingerprint,
        )
    )
    if previous_candidate:
        return previous_candidate
    report["fingerprint"] = fingerprint
    version = DatasetVersion(
        import_run_id=run.id,
        parent_version_id=parent.id if parent else None,
        expected_dates=[d.isoformat() for d in expected_weeks(list(dates))],
        state="needs_review" if issues or parent is None else "candidate",
        report=report,
    )
    session.add(version)
    session.flush()
    session.add_all(Observation(dataset_version=version.id, **row) for row in merged.values())
    session.flush()
    return version


def activate(session, version: DatasetVersion):
    version.state = "published"
    version.published_at = utcnow()
    state = session.get(DatasetState, 1)
    state.active_version_id = version.id


def ingest_documents(settings: Settings, documents: list[Downloaded], *, mode="bootstrap") -> dict:
    with writer_lock(settings.data_dir):
        check_disk(settings)
        with session_for(settings) as session:
            recover_interrupted_runs(session)
            run = ImportRun(mode=mode)
            session.add(run)
            session.commit()
            try:
                version = stage(session, settings, run, documents)
                if version is None:
                    run.status = "no_changes"
                elif version.state == "needs_review":
                    run.status = "needs_review"
                else:
                    activate(session, version)
                    run.status = "published"
                run.finished_at = utcnow()
                run.report = {
                    "documents": len(documents),
                    "dataset_version": version.id if version else None,
                    "tls_verified": None,
                    "validation": version.report if version else {},
                }
                session.commit()
                return {"run_id": run.id, "status": run.status, **run.report}
            except Exception as exc:
                session.rollback()
                run = session.get(ImportRun, run.id)
                run.status, run.finished_at = "failed", utcnow()
                run.report = {"error_code": type(exc).__name__, "message": str(exc)[:200]}
                session.commit()
                raise


def collect(settings: Settings, *, weeks=13, bootstrap=False, client=None) -> dict:
    # The lock covers discovery/download/staging as well, not only the final database write.
    with writer_lock(settings.data_dir):
        check_disk(settings)
        with session_for(settings) as session:
            recover_interrupted_runs(session)
            run = ImportRun(mode="bootstrap" if bootstrap else "incremental")
            session.add(run)
            session.commit()
            owned = client is None
            client = client or SourceClient(settings)
            try:
                catalog = client.get(CATALOG_URL)
                urls = discover_urls(catalog, CATALOG_URL)
                dated = sorted(((publication_date(u), u) for u in urls), reverse=True)
                if not dated:
                    raise SourceError("NO_PUBLICATIONS_DISCOVERED")
                selected = dated[:weeks]
                active = session.get(DatasetState, 1)
                if not bootstrap and active and active.active_version_id:
                    known = set(session.scalars(select(SourceDocument.url)))
                    selected = [
                        (d, u)
                        for index, (d, u) in enumerate(selected)
                        if index < 8 or u not in known
                    ]
                # Close the read transaction before network work.
                session.commit()
                documents = []
                for published, url in selected:
                    content = client.get(url)
                    save_original(settings, content)
                    documents.append(Downloaded(url, content, published))
                version = stage(session, settings, run, documents)
                if version is None:
                    run.status = "no_changes"
                elif version.state == "needs_review":
                    run.status = "needs_review"
                else:
                    activate(session, version)
                    run.status = "published"
                run.finished_at = utcnow()
                run.report = {
                    "documents": len(documents),
                    "dataset_version": version.id if version else None,
                    "tls_verified": settings.rosstat_verify_tls,
                    "validation": version.report if version else {},
                }
                session.commit()
                return {"run_id": run.id, "status": run.status, **run.report}
            except Exception as exc:
                session.rollback()
                run = session.get(ImportRun, run.id)
                run.status, run.finished_at = "partial_failure", utcnow()
                run.report = {"error_code": type(exc).__name__, "message": str(exc)[:200]}
                session.commit()
                raise
            finally:
                if owned:
                    client.close()
