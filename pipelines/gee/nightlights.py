import ee
from .config import VIIRS_MIN_COVERAGE, VIIRS_MONTHLY


def monthly_collection(start: str, end: str, region: ee.Geometry) -> ee.ImageCollection:
    return (
        ee.ImageCollection(VIIRS_MONTHLY)
        .filterDate(start, end)
        .filterBounds(region)
        .map(lambda image: image.select("avg_rad").updateMask(image.select("cf_cvg").gte(VIIRS_MIN_COVERAGE)).copyProperties(image, ["system:time_start"]))
    )


def annual_mean(year: int, region: ee.Geometry) -> ee.Image:
    start = ee.Date.fromYMD(year, 1, 1)
    end = start.advance(1, "year")
    return monthly_collection(start.format("YYYY-MM-dd"), end.format("YYYY-MM-dd"), region).mean().rename("mean_radiance").set({"year": year, "status": "provisional" if year == 2026 else "final"})
