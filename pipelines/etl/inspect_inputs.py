import argparse, json
from pathlib import Path
import pandas as pd
from .common import checksum


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", type=Path, required=True)
    args = parser.parse_args()
    results = []
    for path in sorted(args.input_dir.glob("*")):
        if not path.is_file() or path.name.startswith("."):
            continue
        item = {"file": path.name, "bytes": path.stat().st_size, "sha256": checksum(path)}
        if path.suffix.lower() == ".xlsx":
            xls = pd.ExcelFile(path)
            item["sheets"] = []
            for sheet in xls.sheet_names:
                frame = pd.read_excel(path, sheet_name=sheet, nrows=5)
                item["sheets"].append({"name": sheet, "columns": list(map(str, frame.columns))})
        elif path.suffix.lower() in {".geojson", ".json"}:
            data = json.loads(path.read_text(encoding="utf-8"))
            item["featureCount"] = len(data.get("features", []))
        results.append(item)
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
