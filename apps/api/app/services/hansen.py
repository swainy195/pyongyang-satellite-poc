from .viirs import initialize_earth_engine
from ..config import get_settings

import ee

HANSEN_GFC = "UMD/hansen/global_forest_change_2025_v1_13"
PALETTE = ["#7f1d1d", "#dc2626", "#f97316", "#facc15"]


def hansen_tile_url(year: int) -> str:
    settings = get_settings()
    if year < 2001 or year > 2025:
        raise ValueError("Hansen year must be between 2001 and 2025")
    if not settings.gee_project_id:
        raise RuntimeError("GEE_PROJECT_ID is not configured")

    initialize_earth_engine()
    image = ee.Image(HANSEN_GFC)
    baseline = image.select("treecover2000").gte(30)
    loss_year = image.select("lossyear").eq(year - 2000)
    loss = baseline.And(loss_year).selfMask().rename("forest_loss")
    map_id = loss.getMapId({"min": 0, "max": 1, "palette": PALETTE})
    return map_id["tile_fetcher"].url_format


def hansen_period_tile_url(start_year: int, end_year: int) -> str:
    settings = get_settings()
    if start_year < 2001 or end_year > 2025 or start_year > end_year:
        raise ValueError("Hansen period must be between 2001 and 2025")
    if not settings.gee_project_id:
        raise RuntimeError("GEE_PROJECT_ID is not configured")

    initialize_earth_engine()
    image = ee.Image(HANSEN_GFC)
    baseline = image.select("treecover2000").gte(30)
    loss_year = image.select("lossyear").gte(start_year - 2000).And(
        image.select("lossyear").lte(end_year - 2000)
    )
    loss = baseline.And(loss_year).selfMask().rename("forest_loss")
    map_id = loss.getMapId({"min": 0, "max": 1, "palette": PALETTE})
    return map_id["tile_fetcher"].url_format
