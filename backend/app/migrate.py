from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import select

from app.config import FUELS, REGIONS, Settings
from app.db import session_for
from app.locking import writer_lock
from app.models import DatasetState, FuelType, Region


def migrate(settings: Settings):
    with writer_lock(settings.data_dir):
        root = Path(__file__).resolve().parents[1]
        cfg = Config(str(root / "alembic.ini"))
        cfg.set_main_option("script_location", str(root / "migrations"))
        cfg.attributes["settings"] = settings
        command.upgrade(cfg, "head")
        with session_for(settings) as session, session.begin():
            for key, name in REGIONS.items():
                if not session.get(Region, key):
                    session.add(Region(id=key, name=name))
            for key, name in FUELS.items():
                if not session.get(FuelType, key):
                    session.add(FuelType(id=key, name=name))
            if session.scalar(select(DatasetState)) is None:
                session.add(DatasetState(id=1))
