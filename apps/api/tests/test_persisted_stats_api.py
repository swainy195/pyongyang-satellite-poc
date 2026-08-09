from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _stats() -> dict[str, list[dict[str, object]]]:
    return {
        "nightlight": [
            {"facility_id": 320344, "year": 2012, "mean_radiance": 2.0},
            {"facility_id": 320344, "year": 2025, "mean_radiance": 4.0},
        ],
        "forest": [
            {"facility_id": 320344, "year": 2012, "annual_loss_km2": 0.1},
            {"facility_id": 320344, "year": 2025, "annual_loss_km2": 0.2},
        ],
    }


def _facility_client() -> MagicMock:
    supabase = MagicMock()
    facility_query = supabase.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value
    facility_query.data = [{"facility_id": 320344, "facility_name": "동평양화력발전소"}]
    return supabase


def test_timeseries_uses_persisted_stats() -> None:
    with patch("app.main._supabase", return_value=_facility_client()), patch(
        "app.main.load_persisted_stats", return_value=_stats()
    ) as load_stats:
        response = client.get("/api/v1/facilities/320344/timeseries?start_year=2012&end_year=2025")

    assert response.status_code == 200
    assert len(response.json()["series"]) == 14
    assert response.json()["series"][0]["nightlight"] == 2.0
    load_stats.assert_called_once()


def test_analysis_reuses_persisted_stats() -> None:
    with patch("app.main._supabase", return_value=_facility_client()), patch(
        "app.main.load_persisted_stats", return_value=_stats()
    ) as load_stats:
        response = client.get("/api/v1/facilities/320344/analysis?start_year=2012&end_year=2025")

    assert response.status_code == 200
    assert response.json()["nightlightChangePct"] == 100.0
    assert response.json()["forestLossKm2"] == 0.3
    assert response.json()["series"]["nightlight"] == _stats()["nightlight"]
    load_stats.assert_called_once()
