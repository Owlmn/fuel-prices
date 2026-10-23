from datetime import UTC, date, datetime
from uuid import uuid4

from sqlalchemy import (
    JSON,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow() -> datetime:
    return datetime.now(UTC)


def identifier() -> str:
    return uuid4().hex


class Base(DeclarativeBase):
    pass


class Region(Base):
    __tablename__ = "regions"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)


class FuelType(Base):
    __tablename__ = "fuel_types"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)


class ImportRun(Base):
    __tablename__ = "import_runs"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=identifier)
    mode: Mapped[str] = mapped_column(String)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String, default="running")
    report: Mapped[dict] = mapped_column(JSON, default=dict)


class SourceDocument(Base):
    __tablename__ = "source_documents"
    __table_args__ = (UniqueConstraint("url", "sha256"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=identifier)
    url: Mapped[str] = mapped_column(String)
    sha256: Mapped[str] = mapped_column(String)
    published_date: Mapped[date] = mapped_column(Date)
    observation_date: Mapped[date] = mapped_column(Date)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    storage_path: Mapped[str] = mapped_column(String)


class DatasetVersion(Base):
    __tablename__ = "dataset_versions"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=identifier)
    schema_version: Mapped[str] = mapped_column(String, default="1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    state: Mapped[str] = mapped_column(String, default="candidate")
    import_run_id: Mapped[str] = mapped_column(ForeignKey("import_runs.id"))
    parent_version_id: Mapped[str | None] = mapped_column(ForeignKey("dataset_versions.id"))
    expected_dates: Mapped[list] = mapped_column(JSON, default=list)
    report: Mapped[dict] = mapped_column(JSON, default=dict)


class Observation(Base):
    __tablename__ = "observations"
    __table_args__ = (CheckConstraint("price_kopecks > 0", name="positive_price"),)
    dataset_version: Mapped[str] = mapped_column(
        ForeignKey("dataset_versions.id"), primary_key=True
    )
    region_id: Mapped[str] = mapped_column(ForeignKey("regions.id"), primary_key=True)
    fuel_type: Mapped[str] = mapped_column(ForeignKey("fuel_types.id"), primary_key=True)
    observation_date: Mapped[date] = mapped_column(Date, primary_key=True)
    price_kopecks: Mapped[int] = mapped_column(Integer)
    source_id: Mapped[str] = mapped_column(ForeignKey("source_documents.id"))
    source_row: Mapped[str] = mapped_column(String)


class DatasetState(Base):
    __tablename__ = "dataset_state"
    __table_args__ = (CheckConstraint("id = 1", name="singleton_state"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    active_version_id: Mapped[str | None] = mapped_column(ForeignKey("dataset_versions.id"))


class ReviewDecision(Base):
    __tablename__ = "review_decisions"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=identifier)
    dataset_version: Mapped[str] = mapped_column(ForeignKey("dataset_versions.id"))
    action: Mapped[str] = mapped_column(String)
    reason: Mapped[str] = mapped_column(String)
    operator: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
