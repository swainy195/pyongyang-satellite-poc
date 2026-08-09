import ee

from .hansen import HANSEN_GFC
from .viirs import VIIRS_MONTHLY, initialize_earth_engine


def facility_timeseries(longitude: float, latitude: float, start_year: int = 2012, end_year: int = 2025) -> list[dict[str, float | int | None]]:
    if start_year < 2012 or end_year > 2025 or start_year > end_year:
        raise ValueError("Time series years must be between 2012 and 2025")
    initialize_earth_engine()
    region = ee.Geometry.Point([longitude, latitude]).buffer(500)
    viirs = ee.ImageCollection(VIIRS_MONTHLY)
    hansen = ee.Image(HANSEN_GFC)

    def annual_feature(year: ee.Number) -> ee.Feature:
        year = ee.Number(year)
        start = ee.Date.fromYMD(year, 1, 1)
        end = start.advance(1, "year")
        nightlight = viirs.filterDate(start, end).select("avg_rad").mean().reduceRegion(
            reducer=ee.Reducer.mean(), geometry=region, scale=500, maxPixels=1e8
        ).get("avg_rad")
        loss = hansen.select("lossyear").eq(year.subtract(2000)).selfMask().multiply(ee.Image.pixelArea()).reduceRegion(
            reducer=ee.Reducer.sum(), geometry=region, scale=30, maxPixels=1e8
        ).get("lossyear")
        return ee.Feature(None, {
            "year": year,
            "nightlight": nightlight,
            "forestLossKm2": ee.Number(loss).divide(1e6),
        })

    collection = ee.FeatureCollection(ee.List.sequence(start_year, end_year).map(annual_feature))
    features = collection.getInfo().get("features", [])
    return [feature.get("properties", {}) for feature in features]
