from functools import lru_cache
import os
import tempfile
from pathlib import Path

import ee

from ..config import get_settings

VIIRS_MONTHLY = "NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG"
PALETTE = ["#111827", "#312e81", "#7e22ce", "#f97316", "#fde047"]


def _credentials_path() -> str | None:
    settings = get_settings()
    if settings.google_application_credentials_json:
        path = Path(tempfile.gettempdir()) / "pyongyang-gee-service-account.json"
        if not path.exists():
            path.write_text(settings.google_application_credentials_json, encoding="utf-8")
        return str(path)
    configured = Path(settings.google_application_credentials) if settings.google_application_credentials else None
    if configured and configured.exists():
        return str(configured)
    fallback = Path(__file__).resolve().parents[4] / "clean-carrier-503304-p6-9c7c19542fac.json"
    return str(fallback) if fallback.exists() else None


@lru_cache
def initialize_earth_engine() -> None:
    settings = get_settings()
    project_id = settings.gee_project_id or os.getenv("GOOGLE_CLOUD_PROJECT", "")
    if not project_id:
        raise RuntimeError("GEE_PROJECT_ID or GOOGLE_CLOUD_PROJECT is not configured")
    credentials_path = _credentials_path()
    if settings.gee_service_account and credentials_path:
        credentials = ee.ServiceAccountCredentials(settings.gee_service_account, credentials_path)
        ee.Initialize(credentials=credentials, project=project_id)
    else:
        ee.Initialize(project=project_id)


def viirs_tile_url(year: int) -> str:
    settings = get_settings()
    if year < 2012 or year > 2026:
        raise ValueError("VIIRS year must be between 2012 and 2026")
    if not settings.gee_project_id:
        raise RuntimeError("GEE_PROJECT_ID is not configured")

    initialize_earth_engine()
    start = ee.Date.fromYMD(year, 1, 1)
    image = (
        ee.ImageCollection(VIIRS_MONTHLY)
        .filterDate(start, start.advance(1, "year"))
        .select("avg_rad")
        .mean()
        .rename("nightlight")
    )
    map_id = image.getMapId({"min": 0, "max": 60, "palette": PALETTE})
    return map_id["tile_fetcher"].url_format
