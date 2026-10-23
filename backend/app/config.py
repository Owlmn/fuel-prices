from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.regions import REGIONS as REGIONS


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="FUEL_", env_file=".env", extra="ignore")

    data_dir: Path = Path("data")
    cors_origins: list[str] = ["http://localhost:5173"]
    rosstat_verify_tls: bool = True
    min_free_disk_mb: int = Field(default=2048, ge=0)
    anomaly_percent: int = Field(default=10, gt=0)
    rate_limit_per_minute: int = Field(default=60, ge=1)
    max_document_bytes: int = 10 * 1024 * 1024
    request_timeout_seconds: float = 30
    collection_timeout_seconds: int = 900
    freshness_days: int = 14
    check_freshness_hours: int = 48

    @property
    def db_path(self) -> Path:
        return self.data_dir.resolve() / "fuel.sqlite"


FUELS = {"diesel": "Дизельное топливо", "ai92": "АИ-92", "ai95": "АИ-95"}
CATALOG_URL = "https://rosstat.gov.ru/compendium/document/50798"
