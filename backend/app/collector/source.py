import random
import re
import time
from dataclasses import dataclass
from datetime import date
from urllib.parse import urljoin, urlsplit

import httpx

from app.config import Settings

ALLOWED_HOSTS = {"rosstat.gov.ru", "www.rosstat.gov.ru"}


class SourceError(RuntimeError):
    pass


def validate_url(url: str) -> str:
    parts = urlsplit(url)
    if (
        parts.scheme != "https"
        or parts.hostname not in ALLOWED_HOSTS
        or parts.username
        or parts.password
        or parts.port not in {None, 443}
        or parts.fragment
    ):
        raise SourceError("SOURCE_URL_NOT_ALLOWED")
    return url


def publication_date(url: str) -> date:
    match = re.search(r"(\d{2})-(\d{2})-(\d{4})\.(?:html?|HTML?)$", urlsplit(url).path)
    if not match:
        raise SourceError("PUBLICATION_DATE_UNKNOWN")
    return date(int(match[3]), int(match[2]), int(match[1]))


@dataclass(frozen=True)
class Downloaded:
    url: str
    content: bytes
    published_date: date


class SourceClient:
    """The optional TLS exception is confined to allowlisted Rosstat requests."""

    def __init__(self, settings: Settings, *, transport=None):
        self.settings = settings
        self.deadline = time.monotonic() + settings.collection_timeout_seconds
        self.client = httpx.Client(
            verify=settings.rosstat_verify_tls,
            timeout=settings.request_timeout_seconds,
            follow_redirects=False,
            transport=transport,
            headers={"User-Agent": "FuelMonitor/0.1 (public statistical research)"},
        )

    def close(self):
        self.client.close()

    def get(self, url: str) -> bytes:
        original = validate_url(url)
        for attempt in range(3):
            if time.monotonic() >= self.deadline:
                raise SourceError("COLLECTION_TIMEOUT")
            current, retry_after = original, None
            try:
                for _redirect in range(5):
                    validate_url(current)
                    with self.client.stream("GET", current) as response:
                        if response.status_code in {301, 302, 303, 307, 308}:
                            current = validate_url(urljoin(current, response.headers["location"]))
                            continue
                        if response.status_code == 429 or 500 <= response.status_code <= 599:
                            retry_after = response.headers.get("retry-after")
                            raise SourceError(f"RETRY_HTTP_{response.status_code}")
                        if response.status_code != 200:
                            raise SourceError(f"HTTP_{response.status_code}")
                        kind = response.headers.get("content-type", "").lower()
                        if kind and not any(
                            x in kind for x in ("text/html", "application/xhtml", "text/plain")
                        ):
                            raise SourceError("UNSUPPORTED_CONTENT_TYPE")
                        if (
                            int(response.headers.get("content-length", "0"))
                            > self.settings.max_document_bytes
                        ):
                            raise SourceError("DOCUMENT_TOO_LARGE")
                        data = bytearray()
                        for chunk in response.iter_bytes():
                            if time.monotonic() >= self.deadline:
                                raise SourceError("COLLECTION_TIMEOUT")
                            data.extend(chunk)
                            if len(data) > self.settings.max_document_bytes:
                                raise SourceError("DOCUMENT_TOO_LARGE")
                        return bytes(data)
                raise SourceError("TOO_MANY_REDIRECTS")
            except (httpx.TimeoutException, httpx.NetworkError) as exc:
                if attempt == 2:
                    raise SourceError("SOURCE_NETWORK_ERROR") from exc
            except SourceError as exc:
                if not str(exc).startswith("RETRY_HTTP_") or attempt == 2:
                    raise
            delay = (
                min(float(retry_after), 30)
                if retry_after and retry_after.isdigit()
                else 2**attempt + random.random()
            )
            if time.monotonic() + delay >= self.deadline:
                raise SourceError("COLLECTION_TIMEOUT")
            time.sleep(delay)
        raise SourceError("SOURCE_NETWORK_ERROR")
