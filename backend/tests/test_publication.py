import sqlite3
from datetime import date

import pytest
from conftest import doc
from sqlalchemy import func, select

from app.collector.service import ingest_documents
from app.collector.source import Downloaded
from app.db import session_for
from app.locking import AlreadyRunning, writer_lock
from app.models import DatasetState, DatasetVersion, Observation
from app.operations import backup, decide, export_snapshot


def test_reimport_is_idempotent(settings, published):
    result = ingest_documents(settings, [doc(day="12 октября", published=date(2026, 10, 14))])
    assert result["status"] == "no_changes"
    with session_for(settings) as session:
        assert session.scalar(select(func.count()).select_from(DatasetVersion)) == 1
        assert session.scalar(select(func.count()).select_from(Observation)) == 255


def test_revision_requires_review_and_reject_preserves_active(settings, published):
    result = ingest_documents(
        settings,
        [
            doc(
                day="12 октября",
                published=date(2026, 10, 14),
                overrides={("primorsky_krai", "diesel"): 8200},
            )
        ],
    )
    assert result["status"] == "needs_review"
    assert result["validation"]["issues"][0]["code"] == "HISTORICAL_REVISION"
    decide(settings, result["dataset_version"], "reject", "Wrong revision", "pytest")
    with session_for(settings) as session:
        assert session.get(DatasetState, 1).active_version_id == published


def test_failed_batch_never_partially_publishes(settings, published):
    broken = Downloaded(
        "https://rosstat.gov.ru/storage/mediabank/bad_28-10-2026.html",
        b"invalid",
        date(2026, 10, 28),
    )
    with pytest.raises(ValueError):
        ingest_documents(settings, [doc(), broken])
    with session_for(settings) as session:
        assert session.get(DatasetState, 1).active_version_id == published
        assert session.scalar(select(func.count()).select_from(Observation)) == 255


def test_price_jump_needs_review(settings, published):
    result = ingest_documents(settings, [doc(overrides={("primorsky_krai", "diesel"): 10000})])
    assert result["status"] == "needs_review"
    assert any(i["code"] == "PRICE_JUMP" for i in result["validation"]["issues"])


def test_two_writers_are_excluded(settings):
    with writer_lock(settings.data_dir):
        with pytest.raises(AlreadyRunning):
            with writer_lock(settings.data_dir):
                pass


def test_backup_and_export(settings, published, tmp_path):
    target = tmp_path / "backup.sqlite"
    backup(settings, target)
    with sqlite3.connect(target) as db:
        assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        assert db.execute("SELECT active_version_id FROM dataset_state").fetchone()[0] == published
    out = tmp_path / "snapshot.json"
    result = export_snapshot(settings, out)
    assert result["observations"] == 255
    assert out.exists()


def test_pending_reimport_reuses_candidate(settings):
    first = ingest_documents(settings, [doc()])
    second = ingest_documents(settings, [doc()])
    assert first["dataset_version"] == second["dataset_version"]


def test_low_disk_preserves_active_dataset(settings, published):
    settings.min_free_disk_mb = 10**12
    with pytest.raises(RuntimeError, match="LOW_DISK"):
        ingest_documents(settings, [doc()])
    with session_for(settings) as session:
        assert session.get(DatasetState, 1).active_version_id == published


def test_obsolete_candidate_cannot_override_new_version(settings, published):
    pending = ingest_documents(settings, [doc(overrides={("primorsky_krai", "diesel"): 10000})])
    valid = ingest_documents(settings, [doc()])
    assert valid["status"] == "published"
    with pytest.raises(ValueError, match="obsolete"):
        decide(settings, pending["dataset_version"], "publish", "Reviewed", "pytest")


def test_backup_contains_originals_and_retains_seven(settings, published):
    from app.maintenance import daily_backup

    for _ in range(8):
        result = daily_backup(settings)
        assert result["originals"] == 1
    assert len(list((settings.data_dir / "backups").glob("fuel-*.sqlite"))) == 7
    assert len(list((settings.data_dir / "backups").glob("fuel-*.sqlite.originals"))) == 7
