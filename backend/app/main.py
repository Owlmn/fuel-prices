import logging
import threading
import time
from collections import OrderedDict
from contextlib import asynccontextmanager
from datetime import date
from uuid import uuid4

from fastapi import FastAPI, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import Settings
from app.db import engine_for
from app.logging_setup import configure_logging
from app.queries import (
    QueryError,
    comparison_response,
    meta_response,
    price_response,
    resolve_version,
)
from app.schemas import ComparisonResponse, Fuel, MetaResponse, PriceResponse

configure_logging()
log = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    engine = engine_for(settings, readonly=True)

    @asynccontextmanager
    async def lifespan(_app):
        yield
        engine.dispose()

    app = FastAPI(
        title="Fuel Monitor API",
        version="0.1.0",
        lifespan=lifespan,
        description="Региональные средние цены Росстата. Цены — копейки/литр. Read-only API.",
    )
    app.state.settings = settings
    counters = OrderedDict()
    guard = threading.Lock()

    def error(request, status, code):
        return JSONResponse(
            status_code=status,
            content={
                "error": {"code": code, "message": code},
                "request_id": request.state.request_id,
            },
        )

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        request.state.request_id = uuid4().hex
        began = time.monotonic()
        if request.url.path.startswith("/api/"):
            ip = request.client.host if request.client else "unknown"
            now = time.monotonic()
            with guard:
                # Entries retain insertion order: expire the oldest window without
                # scanning all clients on every request.
                while counters and now - next(iter(counters.values()))[0] >= 60:
                    counters.popitem(last=False)
                if ip not in counters:
                    counters[ip] = [now, 0]
                counters[ip][1] += 1
                limited = counters[ip][1] > settings.rate_limit_per_minute
                while len(counters) > 10000:
                    counters.popitem(last=False)
            if limited:
                response = error(request, 429, "RATE_LIMITED")
                response.headers["Retry-After"] = "60"
                response.headers["X-Request-ID"] = request.state.request_id
                return response
        try:
            response = await call_next(request)
        except Exception:
            log.exception("request_failed request_id=%s", request.state.request_id)
            response = error(request, 500, "INTERNAL_ERROR")
        response.headers["X-Request-ID"] = request.state.request_id
        if request.url.path.startswith("/health") or response.status_code != 200:
            response.headers["Cache-Control"] = "no-store"
        log.info(
            "request request_id=%s path=%s status=%s duration_ms=%.1f",
            request.state.request_id,
            request.url.path,
            response.status_code,
            (time.monotonic() - began) * 1000,
        )
        return response

    @app.exception_handler(QueryError)
    async def query_error(request, exc):
        return error(request, exc.status, exc.code)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, _exc):
        return error(request, 422, "INVALID_REQUEST")

    @app.exception_handler(SQLAlchemyError)
    async def database_error(request, _exc):
        log.warning("database_unavailable request_id=%s", request.state.request_id)
        return error(request, 503, "DATABASE_UNAVAILABLE")

    def check_period(start, end):
        if start > end or (end - start).days > 366:
            raise QueryError(422, "INVALID_PERIOD")

    @app.get("/health/live")
    def live():
        return {"status": "ok"}

    @app.get("/health/ready")
    def ready():
        with Session(engine) as session:
            session.execute(text("SELECT 1"))
            resolve_version(session, None)
        return {"status": "ready"}

    @app.get("/api/v1/meta", response_model=MetaResponse)
    def meta(response: Response, dataset_version: str | None = None):
        with Session(engine) as session:
            version = resolve_version(session, dataset_version)
            result = meta_response(session, version, settings)
        response.headers["Cache-Control"] = "public, max-age=60"
        return result

    @app.get("/api/v1/prices", response_model=PriceResponse)
    def prices(
        response: Response,
        region: str,
        fuel: Fuel,
        dataset_version: str,
        start: date = Query(alias="from"),
        end: date = Query(alias="to"),
    ):
        check_period(start, end)
        with Session(engine) as session:
            version = resolve_version(session, dataset_version)
            result = price_response(session, version, region, fuel, start, end, settings)
        response.headers["Cache-Control"] = "public, max-age=60"
        return result

    @app.get("/api/v1/comparison", response_model=ComparisonResponse)
    def comparison(
        response: Response,
        fuel: Fuel,
        dataset_version: str,
        base_region: str,
        regions: list[str] = Query(min_length=2, max_length=3),
        start: date = Query(alias="from"),
        end: date = Query(alias="to"),
    ):
        check_period(start, end)
        if len(set(regions)) != len(regions) or base_region not in regions:
            raise QueryError(422, "INVALID_REGIONS")
        with Session(engine) as session:
            version = resolve_version(session, dataset_version)
            result = comparison_response(
                session, version, regions, base_region, fuel, start, end, settings
            )
        response.headers["Cache-Control"] = "public, max-age=60"
        return result

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET"],
        allow_headers=["Content-Type"],
        expose_headers=["X-Request-ID"],
    )
    return app


app = create_app()
