import argparse
from pathlib import Path
import pandas as pd
from .common import clean_text, require_columns

REQUIRED = {"시설물번호", "시설물명", "속성명", "속성값"}


def transform(input_path: Path) -> pd.DataFrame:
    frame = pd.read_excel(input_path, sheet_name="시설물 속성 데이터")
    require_columns(frame, REQUIRED)
    unnamed = [c for c in frame.columns if str(c).startswith("Unnamed")]
    if unnamed:
        tails = frame[unnamed].apply(lambda row: " ".join(str(v) for v in row if pd.notna(v)), axis=1)
        frame["속성값"] = frame.apply(
            lambda row: " ".join(filter(None, [clean_text(row["속성값"]), clean_text(tails.loc[row.name])])), axis=1
        )
    for col in ["시설물명", "속성명", "속성값"]:
        frame[col] = frame[col].map(clean_text)
    frame["is_exact_duplicate"] = frame.duplicated(
        subset=["시설물번호", "시설물명", "속성명", "속성값"], keep="first"
    )
    frame["source_row_number"] = frame.index + 2
    return frame.rename(columns={
        "시설물번호": "source_facility_no", "시설물명": "source_facility_name",
        "속성명": "attribute_name", "속성값": "attribute_value",
    })


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = transform(args.input)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    result.to_csv(args.output, index=False, encoding="utf-8-sig")
    print(f"시설물 속성 {len(result):,}건 저장: {args.output}")


if __name__ == "__main__":
    main()
