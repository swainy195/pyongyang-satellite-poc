import argparse
from pathlib import Path
import pandas as pd
from .common import clean_text

ALIASES = {
    "source_trend_no": ["동향번호", "번호", "trend_no"],
    "title": ["제목", "동향제목", "title"],
    "body_text": ["내용", "본문", "동향내용", "body"],
    "published_at": ["등록일", "게시일", "작성일", "published_at"],
    "category": ["분류", "카테고리", "category"],
    "source_url": ["URL", "원문URL", "링크", "url"],
}


def find_column(columns: list[str], aliases: list[str]) -> str | None:
    normalized = {"".join(str(c).lower().split()): str(c) for c in columns}
    for alias in aliases:
        key = "".join(alias.lower().split())
        if key in normalized:
            return normalized[key]
    return None


def transform(input_path: Path) -> pd.DataFrame:
    xls = pd.ExcelFile(input_path)
    frame = pd.read_excel(input_path, sheet_name=xls.sheet_names[0])
    mapping = {}
    for target, aliases in ALIASES.items():
        source = find_column(list(map(str, frame.columns)), aliases)
        if source:
            mapping[source] = target
    result = frame.rename(columns=mapping)
    if "source_trend_no" not in result.columns:
        raise ValueError(f"동향번호 컬럼을 찾지 못했습니다. 실제 컬럼: {list(frame.columns)}")
    for col in ["title", "body_text", "category", "source_url"]:
        if col in result.columns:
            result[col] = result[col].map(clean_text)
    if "published_at" in result.columns:
        result["published_at"] = pd.to_datetime(result["published_at"], errors="coerce")
    result["source_row_number"] = result.index + 2
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = transform(args.input)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    result.to_csv(args.output, index=False, encoding="utf-8-sig")
    print(f"전체동향 {len(result):,}건 저장: {args.output}")


if __name__ == "__main__":
    main()
