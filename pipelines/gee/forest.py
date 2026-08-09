import ee
from .config import HANSEN_GFC


def loss_between(start_year: int, end_year: int, threshold: int = 30) -> ee.Image:
    image = ee.Image(HANSEN_GFC)
    baseline = image.select("treecover2000").gte(threshold)
    loss_year = image.select("lossyear").add(2000)
    return baseline.And(loss_year.gt(start_year)).And(loss_year.lte(end_year)).selfMask().rename("tree_cover_loss")
