import os
import ee


def initialize() -> None:
    project = os.environ.get("GEE_PROJECT_ID")
    if not project:
        raise RuntimeError("GEE_PROJECT_ID가 필요합니다.")
    ee.Initialize(project=project)
