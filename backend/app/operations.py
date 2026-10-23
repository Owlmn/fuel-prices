import hashlib
import json
import os
import shutil
import sqlite3
from contextlib import closing
from datetime import date
from pathlib import Path

from sqlalchemy import func, select

from app.collector.service import activate, check_disk
from app.config import Settings
from app.db import session_for
from app.locking import writer_lock
from app.models import DatasetState, DatasetVersion, Observation, ReviewDecision
from app.queries import meta_response


def decide(settings: Settings, version_id: str, action: str, reason: str, operator: str) -> dict:
    if (
        action not in {"publish", "reject", "rollback"}
        or not reason.strip()
        or not operator.strip()
    ):
        raise ValueError("Action, non-empty reason and operator are required")
    with writer_lock(settings.data_dir), session_for(settings) as session, session.begin():
        version = session.get(DatasetVersion, version_id)
        if version is None:
            raise ValueError("Dataset version not found")
        state = session.get(DatasetState, 1)
        if action == "rollback":
            if version.state != "published":
                raise ValueError("Rollback requires a previously published version")
            state.active_version_id = version.id
        else:
            if version.state not in {"candidate", "needs_review"}:
                raise ValueError("Only a pending version can be reviewed")
            if action == "publish":
                if version.parent_version_id != state.active_version_id:
                    raise ValueError("Candidate is based on an obsolete version; collect again")
                count = session.scalar(
                    select(func.count())
                    .select_from(Observation)
                    .where(Observation.dataset_version == version.id)
                )
                if not count:
                    raise ValueError("Cannot publish an empty dataset")
                activate(session, version)
            else:
                version.state = "rejected"
        session.add(
            ReviewDecision(
                dataset_version=version.id, action=action, reason=reason, operator=operator
            )
        )
        return {"dataset_version": version.id, "state": version.state, "action": action}


def export_snapshot(settings: Settings, output: Path, version_id: str | None = None):
    from app.queries import resolve_version

    with session_for(settings, readonly=True) as session:
        version = resolve_version(session, version_id)
        metadata = meta_response(session, version, settings)
        rows = session.scalars(
            select(Observation)
            .where(Observation.dataset_version == version.id)
            .order_by(Observation.region_id, Observation.fuel_type, Observation.observation_date)
        )
        payload = {
            "meta": metadata,
            "observations": [
                dict(
                    region_id=r.region_id,
                    fuel_type=r.fuel_type,
                    date=r.observation_date,
                    price_kopecks=r.price_kopecks,
                    source_id=r.source_id,
                )
                for r in rows
            ],
        }
        content = json.dumps(payload, ensure_ascii=False, indent=2, default=lambda v: v.isoformat())
    output.parent.mkdir(parents=True, exist_ok=True)
    temp = output.with_suffix(output.suffix + ".tmp")
    temp.write_text(content + "\n", encoding="utf-8")
    os.replace(temp, output)
    return {
        "file": str(output),
        "dataset_version": version.id,
        "observations": len(payload["observations"]),
    }


def backup(settings: Settings, output: Path):
    with writer_lock(settings.data_dir):
        check_disk(settings)
        output = output.resolve()
        originals_dir = output.with_suffix(output.suffix + ".originals")
        if output == settings.db_path or output.exists() or originals_dir.exists():
            raise ValueError("Backup target must be a new file, different from the source")
        output.parent.mkdir(parents=True, exist_ok=True)
        temp = output.with_suffix(output.suffix + ".tmp")
        with (
            closing(sqlite3.connect(settings.db_path.as_uri() + "?mode=ro", uri=True)) as source,
            closing(sqlite3.connect(temp)) as target,
        ):
            source.backup(target)
            if target.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise ValueError("Backup integrity check failed")
            documents = target.execute(
                "SELECT storage_path, sha256 FROM source_documents"
            ).fetchall()
        originals_dir.mkdir()
        for relative, digest in documents:
            if relative != f"originals/{digest}.html":
                raise ValueError("Unexpected original document path")
            original = (settings.data_dir / relative).resolve()
            if not original.is_relative_to(settings.data_dir.resolve()):
                raise ValueError("Original path escapes data directory")
            if not original.is_file():
                raise ValueError("Referenced original document is missing")
            with original.open("rb") as stream:
                if hashlib.file_digest(stream, "sha256").hexdigest() != digest:
                    raise ValueError("Original document checksum mismatch")
            destination = originals_dir / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(original, destination)
        (originals_dir / "manifest.json").write_text(
            json.dumps(
                [{"storage_path": path, "sha256": digest} for path, digest in documents], indent=2
            ),
            encoding="utf-8",
        )
        os.replace(temp, output)
        return {
            "file": str(output),
            "integrity_check": "ok",
            "created_on": date.today().isoformat(),
            "originals": len(documents),
            "originals_directory": str(originals_dir),
        }
