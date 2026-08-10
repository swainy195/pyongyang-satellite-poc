from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_data_availability() -> None:
    response = client.get("/api/v1/data-availability")
    assert response.status_code == 200
    assert response.json()["nightlights"]["start"] == "2012-04"


def test_nightlight_difference_tile_metadata() -> None:
    visualization = {
        "tiles": ["https://earthengine.example/{z}/{x}/{y}"],
        "min": -4.0,
        "max": 4.0,
        "neutral_threshold": 0.3,
    }
    with patch("app.main.viirs_difference_tile", return_value=visualization):
        response = client.get("/api/v1/map/tiles/nightlight/difference?base_year=2014&compare_year=2025")

    assert response.status_code == 200
    assert response.json()["operation"] == "compare_year_minus_base_year"
    assert response.json()["base_year"] == 2014
    assert response.json()["compare_year"] == 2025
    assert response.json()["neutral_threshold"] == 0.3


def test_forest_period_tile_metadata() -> None:
    with patch("app.main.hansen_period_tile_url", return_value="https://earthengine.example/{z}/{x}/{y}"):
        response = client.get("/api/v1/map/tiles/forest/period?start_year=2014&end_year=2025")

    assert response.status_code == 200
    assert response.json()["operation"] == "forest_loss_between_years"
    assert response.json()["start_year"] == 2014
    assert response.json()["end_year"] == 2025


def test_database_health_uses_supabase_sdk() -> None:
    supabase = MagicMock()
    supabase.table.return_value.select.return_value.limit.return_value.execute.return_value = MagicMock()
    with patch("app.main._supabase", return_value=supabase):
        response = client.get("/health/db")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "connected": True}
    supabase.table.assert_called_with("facilities")


def test_admin_boundaries_reads_supabase_table() -> None:
    rows = [{
        "id": "boundary-1",
        "admcd": "KP-01",
        "do_name": "Pyongyang",
        "jic": None,
        "si": None,
        "dong": None,
        "origin": None,
        "rm": None,
        "nid": None,
        "cl": None,
        "mplis": None,
        "gu": None,
        "boundary_year": 2025,
        "geom": {"type": "MultiPolygon", "coordinates": []},
    }]
    supabase = MagicMock()
    query = supabase.table.return_value.select.return_value.order.return_value.execute.return_value
    query.data = rows
    with patch("app.main._supabase", return_value=supabase):
        response = client.get("/api/v1/admin-boundaries")

    assert response.status_code == 200
    assert response.json()["features"][0]["properties"]["admcd"] == "KP-01"
    assert response.json()["features"][0]["geometry"]["type"] == "MultiPolygon"


def test_facility_trends_returns_latest_period_items() -> None:
    class Query:
        def __init__(self, data: list[dict[str, object]]) -> None:
            self.data = data

        def select(self, *_args: object, **_kwargs: object) -> "Query":
            return self

        def eq(self, *_args: object, **_kwargs: object) -> "Query":
            return self

        def limit(self, *_args: object, **_kwargs: object) -> "Query":
            return self

        def in_(self, *_args: object, **_kwargs: object) -> "Query":
            return self

        def gte(self, *_args: object, **_kwargs: object) -> "Query":
            return self

        def lte(self, *_args: object, **_kwargs: object) -> "Query":
            return self

        def order(self, *_args: object, **_kwargs: object) -> "Query":
            return self

        def execute(self) -> object:
            return type("Result", (), {"data": self.data})()

    queries = {
        "facilities": Query([{"facility_id": 320344}]),
        "trend_facilities": Query([{"trend_id": 7}]),
        "trends": Query([{
            "trend_id": 7,
            "trend_date": "2024-03-12",
            "title": "시설 관련 동향",
            "content_text": "공개 자료 요약",
            "source_url": "https://example.com/trend/7",
        }]),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda name: queries[name]

    with patch("app.main._supabase", return_value=supabase):
        response = client.get("/api/v1/facilities/320344/trends?start_year=2014&end_year=2025")

    assert response.status_code == 200
    assert response.json()["items"][0]["title"] == "시설 관련 동향"
    assert response.json()["items"][0]["summary"] == "공개 자료 요약"


def test_report_contains_facility_analysis_sections() -> None:
    with patch("app.main.data_status", return_value={"tables": {"facilities": 1718}}), patch(
        "app.main.build_evidence_package", return_value={"status": "ok"}
    ), patch(
        "app.main.facility_detail",
        return_value={"facility": {"name": "동평양화력발전소", "category": "산업/경제 · 전력", "address": "평양직할시"}},
    ), patch(
        "app.main.facility_analysis",
        return_value={
            "nightlightChangePct": 201.7,
            "forestLossKm2": 0.0,
            "observation": "관측 내용",
            "interpretation": "참고 해석",
            "confidence": "관측 기반 참고",
        "series": {"nightlight": [{"year": 2014, "mean_radiance": 1.0}, {"year": 2025, "mean_radiance": 3.0}]},
        },
    ), patch(
        "app.main.facility_trends",
        return_value={"items": [{"date": "2024-03-12", "title": "관련 동향", "summary": "동향 요약", "source_url": "https://example.com"}]},
    ):
        response = client.post("/api/v1/reports", json={
            "admin_code": "ALL",
            "period_start": "2014-01-01",
        "period_end": "2025-12-31",
            "facility_ids": ["320344"],
            "metrics": ["combined"],
        })

    assert response.status_code == 202
    markdown = client.get(f"/api/v1/reports/{response.json()['id']}").json()["markdown"]
    assert "동평양화력발전소" in markdown
    assert "관련 동향" in markdown
    assert "관측 내용" in markdown
    assert "데이터 출처" in markdown
