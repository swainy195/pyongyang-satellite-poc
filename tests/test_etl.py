import pandas as pd
from pipelines.etl.common import clean_text, require_columns


def test_clean_text() -> None:
    assert clean_text(" 삼석구역\n ") == "삼석구역"
    assert clean_text(None) is None


def test_require_columns() -> None:
    frame = pd.DataFrame(columns=["시설물번호", "시설물명"])
    require_columns(frame, {"시설물번호", "시설물명"})
