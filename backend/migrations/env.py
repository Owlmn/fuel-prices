from alembic import context

from app.config import Settings
from app.db import engine_for
from app.models import Base

config = context.config
settings = config.attributes.get("settings") or Settings()
settings.data_dir.mkdir(parents=True, exist_ok=True)
engine = engine_for(settings)
with engine.connect() as connection:
    connection.exec_driver_sql("PRAGMA journal_mode=WAL")
    connection.commit()
    context.configure(connection=connection, target_metadata=Base.metadata, render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()
engine.dispose()
