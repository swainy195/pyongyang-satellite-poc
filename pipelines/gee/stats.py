"""Generate and upsert facility-level annual satellite statistics."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Any

import ee
from dotenv import load_dotenv

# The repository's `supabase/` migrations directory shadows the SDK package when
# this module is launched from the repository root.
_root = Path(__file__).resolve().parents[2]
load_dotenv(_root / ".env")
if sys.path and Path(sys.path[0]).resolve() == _root:
    sys.path.pop(0)
from supabase import create_client
sys.path.insert(0, str(_root))

from .config import HANSEN_GFC, VIIRS_MONTHLY


def _client() -> Any:
    return create_client(os.environ["SUPABASE_URL"], os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ["SUPABASE_ANON_KEY"])


def _region(longitude: float, latitude: float, buffer_meters: int = 500) -> ee.Geometry:
    return ee.Geometry.Point([longitude, latitude]).buffer(buffer_meters)


def generate_facility_stats(facility_id: int, longitude: float, latitude: float, start_year: int, end_year: int) -> tuple[list[dict], list[dict]]:
    region = _region(longitude, latitude)
    nightlight_rows: list[dict] = []
    forest_rows: list[dict] = []
    for year in range(start_year, end_year + 1):
        viirs = (ee.ImageCollection(VIIRS_MONTHLY).filterDate(f"{year}-01-01", f"{year + 1}-01-01").select("avg_rad").mean())
        viirs_stats = viirs.reduceRegion(ee.Reducer.mean().combine(ee.Reducer.max(), "", True).combine(ee.Reducer.min(), "", True), region, 500, maxPixels=1_000_000).getInfo() or {}
        nightlight_rows.append({"facility_id": facility_id, "year": year, "mean_radiance": viirs_stats.get("avg_rad_mean"), "max_radiance": viirs_stats.get("avg_rad_max"), "min_radiance": viirs_stats.get("avg_rad_min"), "pixel_count": None, "gee_dataset_id": VIIRS_MONTHLY, "processing_version": "gee-stats-v1"})

        loss = ee.Image(HANSEN_GFC).select("lossyear").eq(year - 2000).selfMask().multiply(ee.Image.pixelArea()).divide(1_000_000)
        loss_km2 = loss.reduceRegion(ee.Reducer.sum(), region, 30, maxPixels=1_000_000).getInfo() or {}
        forest_rows.append({"facility_id": facility_id, "year": year, "annual_loss_km2": loss_km2.get("lossyear"), "gee_dataset_id": HANSEN_GFC, "processing_version": "gee-stats-v1"})
    return nightlight_rows, forest_rows


def run(start_year: int, end_year: int, limit: int | None = None, offset: int = 0) -> None:
    project = os.environ["GEE_PROJECT_ID"]
    service_account = os.environ.get("GEE_SERVICE_ACCOUNT")
    credentials_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if credentials_path and not Path(credentials_path).is_absolute():
        credentials_path = str(_root / credentials_path)
    if service_account and credentials_path and Path(credentials_path).exists():
        credentials = ee.ServiceAccountCredentials(service_account, credentials_path)
        ee.Initialize(credentials=credentials, project=project)
    else:
        ee.Initialize(project=project)
    client = _client()
    processed = 0
    page_size = 500
    while True:
        page_start = offset + processed
        page = (client.table("facilities").select("facility_id,longitude,latitude").not_.is_("longitude", "null").not_.is_("latitude", "null").range(page_start, page_start + page_size - 1).execute().data)
        if not page:
            break
        for facility in page:
            nightlight, forest = generate_facility_stats(int(facility["facility_id"]), float(facility["longitude"]), float(facility["latitude"]), start_year, end_year)
            client.table("nightlight_stats").upsert(nightlight, on_conflict="facility_id,year").execute()
            client.table("forest_stats").upsert(forest, on_conflict="facility_id,year").execute()
            processed += 1
            print(f"facility={facility['facility_id']} years={start_year}-{end_year}", flush=True)
            if limit and processed >= limit:
                return
        if len(page) < page_size:
            break


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--start-year", type=int, default=2012)
    parser.add_argument("--end-year", type=int, default=2025)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--offset", type=int, default=0)
    args = parser.parse_args()
    run(args.start_year, args.end_year, args.limit, args.offset)
