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
        response = client.get("/api/v1/map/tiles/nightlight/difference?base_year=2014&compare_year=2024")

    assert response.status_code == 200
    assert response.json()["operation"] == "compare_year_minus_base_year"
    assert response.json()["base_year"] == 2014
    assert response.json()["compare_year"] == 2024
    assert response.json()["neutral_threshold"] == 0.3


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
