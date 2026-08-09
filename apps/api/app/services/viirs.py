from functools import lru_cache
import os
import tempfile
from pathlib import Path

import ee

from ..config import get_settings

VIIRS_MONTHLY = "NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG"
PALETTE = ["#111827", "#312e81", "#7e22ce", "#f97316", "#fde047"]
DIFFERENCE_PALETTE = ["#0891b2", "#67e8f9", "#e5e7eb", "#fdba74", "#f59e0b"]


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


def _annual_viirs_image(year: int) -> ee.Image:
    if year < 2012 or year > 2026:
        raise ValueError("VIIRS year must be between 2012 and 2026")
    start = ee.Date.fromYMD(year, 1, 1)
    return (
        ee.ImageCollection(VIIRS_MONTHLY)
        .filterDate(start, start.advance(1, "year"))
        .select("avg_rad")
        .mean()
        .rename("nightlight")
    )


def viirs_tile_url(year: int) -> str:
    settings = get_settings()
    if not settings.gee_project_id:
        raise RuntimeError("GEE_PROJECT_ID is not configured")

    initialize_earth_engine()
    image = _annual_viirs_image(year)
    map_id = image.getMapId({"min": 0, "max": 60, "palette": PALETTE})
    return map_id["tile_fetcher"].url_format


@lru_cache(maxsize=32)
def viirs_difference_tile(base_year: int, compare_year: int) -> dict[str, object]:
    settings = get_settings()
    if not settings.gee_project_id:
        raise RuntimeError("GEE_PROJECT_ID is not configured")
    if base_year < 2012 or base_year > 2026 or compare_year < 2012 or compare_year > 2026:
        raise ValueError("VIIRS year must be between 2012 and 2026")
    if base_year == compare_year:
        raise ValueError("Difference years must be different")

    initialize_earth_engine()
    difference = _annual_viirs_image(compare_year).subtract(_annual_viirs_image(base_year)).rename("nightlight_difference")
    region = ee.Geometry.Rectangle([124, 37, 131, 43], geodesic=False)
    abs_difference = difference.abs().rename("absolute_difference")
    distribution = difference.addBands(abs_difference).reduceRegion(
        reducer=ee.Reducer.percentile([2, 25, 98]),
        geometry=region,
        scale=500,
        bestEffort=True,
        maxPixels=100_000_000,
    ).getInfo()
    lower = distribution.get("nightlight_difference_p2")
    upper = distribution.get("nightlight_difference_p98")
    neutral_threshold = distribution.get("absolute_difference_p25")
    if lower is None or upper is None or neutral_threshold is None:
        raise RuntimeError("Could not derive VIIRS difference visualization range")

    max_abs = max(abs(float(lower)), abs(float(upper)))
    if max_abs <= 0:
        raise RuntimeError("VIIRS difference range is empty")
    neutral_threshold = min(float(neutral_threshold), max_abs)
    image = difference.updateMask(abs_difference.gte(neutral_threshold))
    map_id = image.getMapId({"min": -max_abs, "max": max_abs, "palette": DIFFERENCE_PALETTE})
    return {
        "tiles": [map_id["tile_fetcher"].url_format],
        "min": -max_abs,
        "max": max_abs,
        "neutral_threshold": neutral_threshold,
    }
