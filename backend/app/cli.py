import argparse
import json
import logging
import sys
from pathlib import Path

from sqlalchemy import select

from app.collector.service import collect, ingest_documents
from app.collector.source import Downloaded, publication_date, validate_url
from app.config import Settings
from app.db import session_for
from app.locking import AlreadyRunning
from app.logging_setup import configure_logging
from app.migrate import migrate
from app.models import DatasetVersion, ImportRun
from app.operations import backup, decide, export_snapshot


def main():
    parser = argparse.ArgumentParser(description="Fuel Monitor operator CLI")
    parser.add_argument("--data-dir", type=Path)
    parser.add_argument(
        "--insecure-rosstat",
        action="store_true",
        help="Disable certificate verification for allowlisted Rosstat HTTPS only",
    )
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("init-db")
    for name in ("collect", "bootstrap"):
        p = sub.add_parser(name)
        p.add_argument("--weeks", type=int, default=13)
    p = sub.add_parser("import-file")
    p.add_argument("file", type=Path)
    p.add_argument("--url", required=True)
    p = sub.add_parser("review")
    p.add_argument("version", nargs="?")
    sub.add_parser("runs")
    for action in ("publish", "reject", "rollback"):
        p = sub.add_parser(action)
        p.add_argument("version")
        p.add_argument("--reason", required=True)
        p.add_argument("--operator", required=True)
    p = sub.add_parser("export-snapshot")
    p.add_argument("output", type=Path)
    p.add_argument("--version")
    p = sub.add_parser("backup")
    p.add_argument("output", type=Path)
    args = parser.parse_args()
    settings = Settings()
    if args.data_dir:
        settings.data_dir = args.data_dir
    if args.insecure_rosstat:
        settings.rosstat_verify_tls = False
    logging.basicConfig(level=logging.WARNING, format="%(message)s")
    configure_logging()
    try:
        if args.command == "init-db":
            migrate(settings)
            result = {"status": "migrated", "database": str(settings.db_path)}
        elif args.command in {"collect", "bootstrap"}:
            if not 1 <= args.weeks <= 53:
                raise ValueError("weeks must be between 1 and 53")
            result = collect(settings, weeks=args.weeks, bootstrap=args.command == "bootstrap")
        elif args.command == "import-file":
            url = validate_url(args.url)
            content = args.file.read_bytes()
            if len(content) > settings.max_document_bytes:
                raise ValueError("Document too large")
            result = ingest_documents(settings, [Downloaded(url, content, publication_date(url))])
        elif args.command in {"publish", "reject", "rollback"}:
            result = decide(settings, args.version, args.command, args.reason, args.operator)
        elif args.command == "export-snapshot":
            result = export_snapshot(settings, args.output, args.version)
        elif args.command == "backup":
            result = backup(settings, args.output)
        else:
            with session_for(settings, readonly=True) as session:
                if args.command == "runs":
                    runs = session.scalars(
                        select(ImportRun).order_by(ImportRun.started_at.desc()).limit(20)
                    )
                    result = [
                        dict(
                            id=r.id,
                            status=r.status,
                            mode=r.mode,
                            started_at=r.started_at,
                            report=r.report,
                        )
                        for r in runs
                    ]
                else:
                    query = select(DatasetVersion)
                    if args.version:
                        query = query.where(DatasetVersion.id == args.version)
                    else:
                        query = query.where(DatasetVersion.state == "needs_review")
                    result = [
                        dict(
                            id=v.id,
                            state=v.state,
                            parent_version_id=v.parent_version_id,
                            report=v.report,
                        )
                        for v in session.scalars(query.order_by(DatasetVersion.created_at.desc()))
                    ]
        print(json.dumps(result, ensure_ascii=False, indent=2, default=str))
    except AlreadyRunning:
        print(json.dumps({"status": "skipped_locked"}))
    except Exception as exc:
        print(
            json.dumps(
                {"status": "failed", "code": type(exc).__name__, "message": str(exc)},
                ensure_ascii=False,
            ),
            file=sys.stderr,
        )
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
