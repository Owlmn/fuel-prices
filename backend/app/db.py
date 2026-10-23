import sqlite3

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool

from app.config import Settings


def engine_for(settings: Settings, *, readonly: bool = False) -> Engine:
    path = settings.db_path

    def connect() -> sqlite3.Connection:
        # mode=ro never creates an empty DB when migrations have not run.
        uri = path.as_uri() + ("?mode=ro" if readonly else "?mode=rwc")
        return sqlite3.connect(uri, uri=True, timeout=5, check_same_thread=False)

    engine = create_engine("sqlite://", creator=connect, poolclass=NullPool)

    @event.listens_for(engine, "connect")
    def pragmas(conn, _record):
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA busy_timeout=5000")
        if readonly:
            conn.execute("PRAGMA query_only=ON")

    return engine


def session_for(settings: Settings, *, readonly: bool = False) -> Session:
    return Session(engine_for(settings, readonly=readonly), expire_on_commit=False)
