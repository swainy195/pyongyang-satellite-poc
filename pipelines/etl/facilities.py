import argparse
from pathlib import Path
import pandas as pd
from .common import clean_text, require_columns

REQUIRED = {"동향번호", "시설물번호", "시설물명", "카테고리", "주소", "x좌표", "y좌표"}


def transform(input_path: Path) -> tuple[pd.DataFrame, pd.DataFrame]:
    frame = pd.read_excel(input_path, sheet_name="시설물 데이터")
    require_columns(frame, REQUIRED)
    for col in ["시설물명", "카테고리", "주소"]:
        frame[col] = frame[col].map(clean_text)
    conflicts = frame.groupby("시설물번호").agg(
        names=("시설물명", "nunique"), categories=("카테고리", "nunique"),
        xs=("x좌표", "nunique"), ys=("y좌표", "nunique")
    )
    if (conflicts[["names", "categories", "xs", "ys"]] > 1).any(axis=None):
        print("경고: 동일 시설물번호의 마스터 필드 충돌이 있습니다. interim 검토가 필요합니다.")
    facilities = frame.drop_duplicates("시설물번호").copy()
    levels = facilities["카테고리"].fillna("").str.split(">", expand=True)
    for i in range(levels.shape[1]):
        facilities[f"category_level_{i+1}"] = levels[i].map(clean_text)
    facilities = facilities.rename(columns={
        "시설물번호": "source_facility_no", "시설물명": "facility_name",
        "카테고리": "category_path", "주소": "address_text",
        "x좌표": "source_x", "y좌표": "source_y",
    })
    links = frame[["동향번호", "시설물번호"]].copy()
    links["source_row_count"] = 1
    links = links.groupby(["동향번호", "시설물번호"], as_index=False)["source_row_count"].sum()
    links = links.rename(columns={"동향번호": "source_trend_no", "시설물번호": "source_facility_no"})
    return facilities, links


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    facilities, links = transform(args.input)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    facilities.to_csv(args.output_dir / "facilities.csv", index=False, encoding="utf-8-sig")
    links.to_csv(args.output_dir / "trend_facilities.csv", index=False, encoding="utf-8-sig")
    print(f"시설물 {len(facilities):,}건, 고유 연결 {len(links):,}건 저장")


if __name__ == "__main__":
    main()
