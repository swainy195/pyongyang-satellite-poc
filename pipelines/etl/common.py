from pathlib import Path
import hashlib
import pandas as pd


def checksum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def clean_text(value: object) -> str | None:
    if pd.isna(value):
        return None
    text = " ".join(str(value).replace("\n", " ").split())
    return text or None


def require_columns(frame: pd.DataFrame, required: set[str]) -> None:
    missing = required - set(map(str, frame.columns))
    if missing:
        raise ValueError(f"필수 컬럼 누락: {sorted(missing)}")
