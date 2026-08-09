import logging
from concurrent.futures import ThreadPoolExecutor
from time import perf_counter
from typing import Any

from supabase import Client

logger = logging.getLogger("uvicorn.error")

NIGHTLIGHT_COLUMNS = "id,facility_id,admin_code,year,mean_radiance,max_radiance,min_radiance,pixel_count,buffer_meters,data_status,gee_dataset_id,processing_version,created_at"
FOREST_COLUMNS = "id,facility_id,admin_code,year,annual_loss_km2,cumulative_loss_km2,buffer_meters,data_status,gee_dataset_id,processing_version,created_at"


def _fetch_stats(client: Client, table: str, columns: str, facility_id: int, start_year: int, end_year: int) -> list[dict[str, Any]]:
    return (
        client.table(table)
        .select(columns)
        .eq("facility_id", facility_id)
        .gte("year", start_year)
        .lte("year", end_year)
        .order("year")
        .execute()
        .data
    )


def load_persisted_stats(
    client: Client,
    facility_id: int,
    start_year: int,
    end_year: int,
) -> dict[str, list[dict[str, Any]]]:
    started = perf_counter()
    with ThreadPoolExecutor(max_workers=2) as executor:
        nightlight_future = executor.submit(
            _fetch_stats, client, "nightlight_stats", NIGHTLIGHT_COLUMNS, facility_id, start_year, end_year
        )
        forest_future = executor.submit(
            _fetch_stats, client, "forest_stats", FOREST_COLUMNS, facility_id, start_year, end_year
        )
        nightlight = nightlight_future.result()
        forest = forest_future.result()
    logger.info(
        "stats query: %.1f ms (nightlight=%d, forest=%d)",
        (perf_counter() - started) * 1000,
        len(nightlight),
        len(forest),
    )
    return {"nightlight": nightlight, "forest": forest}


def stats_to_timeseries(
    stats: dict[str, list[dict[str, Any]]],
    start_year: int,
    end_year: int,
) -> list[dict[str, Any]]:
    nightlight_by_year = {row["year"]: row.get("mean_radiance") for row in stats["nightlight"]}
    forest_by_year = {row["year"]: row.get("annual_loss_km2") for row in stats["forest"]}
    return [
        {
            "year": year,
            "nightlight": nightlight_by_year.get(year),
            "forestLossKm2": forest_by_year.get(year),
        }
        for year in range(start_year, end_year + 1)
    ]
