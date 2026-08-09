import argparse
from pathlib import Path
import pandas as pd


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", type=Path, required=True)
    args = parser.parse_args()
    issues = []
    facilities_path = args.input_dir / "facilities.csv"
    links_path = args.input_dir / "trend_facilities.csv"
    attrs_path = args.input_dir / "facility_attributes.csv"
    if facilities_path.exists():
        facilities = pd.read_csv(facilities_path)
        if facilities["source_facility_no"].duplicated().any():
            issues.append("시설물번호 중복")
        if facilities[["source_x", "source_y"]].isna().any(axis=None):
            issues.append("시설물 좌표 결측")
    if links_path.exists() and facilities_path.exists():
        links = pd.read_csv(links_path)
        orphans = set(links["source_facility_no"]) - set(facilities["source_facility_no"])
        if orphans:
            issues.append(f"동향 연결의 미등록 시설물 {len(orphans)}건")
    if attrs_path.exists() and facilities_path.exists():
        attrs = pd.read_csv(attrs_path)
        orphans = set(attrs["source_facility_no"]) - set(facilities["source_facility_no"])
        print(f"시설물 마스터에 없는 속성 시설물번호: {len(orphans)}건")
    if issues:
        raise SystemExit("검증 실패: " + ", ".join(issues))
    print("기본 참조·중복 검증을 통과했습니다.")


if __name__ == "__main__":
    main()
