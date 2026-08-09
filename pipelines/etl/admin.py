import argparse
from pathlib import Path
import geopandas as gpd
from .common import clean_text


def transform(input_path: Path) -> gpd.GeoDataFrame:
    frame = gpd.read_file(input_path)
    if frame.crs is None:
        frame = frame.set_crs("EPSG:4326")
    else:
        frame = frame.to_crs("EPSG:4326")
    for column in ["do", "jic", "si", "gu"]:
        if column in frame.columns:
            frame[column] = frame[column].map(clean_text)
    frame["admin_name"] = frame.apply(
        lambda row: next((row.get(c) for c in ["gu", "si", "jic", "do"] if row.get(c)), None), axis=1
    )
    frame["geometry"] = frame.geometry.make_valid()
    # 동일 admcd의 분리 폴리곤을 하나의 분석 경계로 병합합니다.
    attrs = [c for c in ["nid", "do", "jic", "si", "gu", "cl", "year", "admin_name"] if c in frame.columns]
    dissolved = frame[["admcd", *attrs, "geometry"]].dissolve(by="admcd", as_index=False, aggfunc="first")
    return dissolved


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = transform(args.input)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    result.to_file(args.output, driver="GeoJSON")
    print(f"행정경계 {len(result):,}건 저장: {args.output}")


if __name__ == "__main__":
    main()
