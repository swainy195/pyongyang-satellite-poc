import json
import logging
import os
from functools import lru_cache
from html import escape
from io import BytesIO
from time import perf_counter
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import ee
from supabase import Client, create_client

from .config import get_settings
from .schemas import DataAvailability, DataRange, ReportJob, ReportRequest
from .services.evidence import build_evidence_package
from .services.hansen import hansen_tile_url
from .services.persisted_stats import load_persisted_stats, stats_to_timeseries
from .services.viirs import VIIRS_MONTHLY, initialize_earth_engine, viirs_difference_tile, viirs_tile_url
from .services.hansen import HANSEN_GFC

settings = get_settings()
REPORTS: dict[str, dict[str, object]] = {}
logger = logging.getLogger("uvicorn.error")
app = FastAPI(title="Pyongyang Satellite Change Analysis API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.web_base_url,
        "https://pyongyang-satellite-poc.vercel.app",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@lru_cache
def _supabase() -> Client:
    key = settings.supabase_service_role_key or settings.supabase_anon_key
    if not settings.supabase_url or not key:
        raise RuntimeError("SUPABASE_URL and a Supabase API key are required")
    return create_client(settings.supabase_url.rstrip("/"), key)


def _parse_geometry(value: object) -> dict | None:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            return None
    return None


def _feature(row: dict) -> dict:
    properties = dict(row)
    geometry = _parse_geometry(properties.pop("geom", None))
    return {"type": "Feature", "geometry": geometry, "properties": properties}


def _supabase_error(error: Exception, resource: str) -> None:
    raise HTTPException(status_code=503, detail=f"Could not load {resource} from Supabase") from error


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "environment": settings.app_env}


@app.get("/health/db")
def database_health() -> dict[str, str | bool]:
    try:
        _supabase().table("facilities").select("facility_id").limit(1).execute()
    except Exception as error:
        return {
            "status": "degraded",
            "connected": False,
            "detail": f"{error.__class__.__name__}: {str(error)[:160]}",
        }
    return {"status": "ok", "connected": True}


@app.get("/api/v1/gee-status")
def gee_status() -> dict[str, object]:
    try:
        project_id = settings.gee_project_id or os.getenv("GOOGLE_CLOUD_PROJECT", "")
        if not project_id:
            raise RuntimeError("GEE_PROJECT_ID or GOOGLE_CLOUD_PROJECT is not configured")

        # Reuse the existing service-account / local-authentication path.
        initialize_earth_engine()
        viirs_size = ee.ImageCollection(VIIRS_MONTHLY).limit(1).size().getInfo()
        hansen_id = ee.Image(HANSEN_GFC).get("system:id").getInfo()
        if not viirs_size or not hansen_id:
            raise RuntimeError("Required Earth Engine datasets are not accessible")
        return {
            "connected": True,
            "status": "ok",
            "project": project_id,
            "datasets": {"viirs": "available", "hansen": "available"},
        }
    except Exception as error:
        raise HTTPException(
            status_code=503,
            detail={
                "connected": False,
                "status": "error",
                "error": f"{error.__class__.__name__}: {str(error)[:240]}",
            },
        ) from error


@app.get("/api/v1/data-availability", response_model=DataAvailability)
def data_availability() -> DataAvailability:
    return DataAvailability(
        nightlights=DataRange(start="2012-04", end="latest-published-month", status="latest-year-provisional"),
        forest=DataRange(start="2000-baseline/2001-loss", end="dataset-version-dependent", status="versioned"),
        integrated=DataRange(start="2012", end="overlap-of-published-datasets", status="derived"),
    )


@app.get("/api/v1/data-status")
def data_status() -> dict[str, object]:
    tables = ("admin_boundaries", "facilities", "facility_attributes", "trends", "trend_facilities")
    try:
        client = _supabase()
        counts: dict[str, int | None] = {}
        for table in tables:
            response = client.table(table).select("*", count="exact", head=True).execute()
            counts[table] = response.count
    except Exception as error:
        _supabase_error(error, "data status")
    return {"connected": True, "tables": counts}


@app.get("/api/v1/map/tiles/nightlight/difference")
def nightlight_difference_tile(base_year: int = Query(..., ge=2012, le=2026), compare_year: int = Query(..., ge=2012, le=2026)) -> dict[str, object]:
    try:
        visualization = viirs_difference_tile(base_year, compare_year)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=503, detail="Could not create VIIRS difference tile") from error
    return {
        "base_year": base_year,
        "compare_year": compare_year,
        "dataset": "NOAA VIIRS DNB Monthly",
        "operation": "compare_year_minus_base_year",
        **visualization,
    }


@app.get("/api/v1/map/tiles/nightlight/{year}")
def nightlight_tile(year: int) -> dict[str, object]:
    try:
        tile_url = viirs_tile_url(year)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=503, detail="Could not create VIIRS tile layer") from error
    return {"year": year, "dataset": "NOAA VIIRS DNB Monthly", "tiles": [tile_url]}


@app.get("/api/v1/map/tiles/forest/{year}")
def forest_tile(year: int) -> dict[str, object]:
    try:
        tile_url = hansen_tile_url(year)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=503, detail="Could not create Hansen tile layer") from error
    return {"year": year, "dataset": "Hansen Global Forest Change", "tiles": [tile_url]}


@app.get("/api/v1/admin-boundaries")
@app.get("/api/v1/admin-areas", include_in_schema=False)
def admin_boundaries() -> dict:
    try:
        rows = (
            _supabase()
            .table("admin_boundaries")
            .select("id,admcd,do_name,jic,si,dong,origin,rm,nid,cl,mplis,gu,boundary_year,geom")
            .order("admcd")
            .execute()
            .data
        )
    except Exception as error:
        _supabase_error(error, "administrative boundaries")
    return {"type": "FeatureCollection", "features": [_feature(row) for row in rows]}


@app.get("/api/v1/admin-boundaries/{admin_code}")
def admin_boundary(admin_code: str) -> dict:
    try:
        response = (
            _supabase()
            .table("admin_boundaries")
            .select("id,admcd,do_name,jic,si,dong,origin,rm,nid,cl,mplis,gu,boundary_year,geom")
            .eq("admcd", admin_code)
            .limit(1)
            .execute()
        )
    except Exception as error:
        _supabase_error(error, "administrative boundary")
    if not response.data:
        raise HTTPException(status_code=404, detail="Administrative boundary not found")
    return _feature(response.data[0])


@app.get("/api/v1/facilities")
def facilities(
    admin_code: str | None = None,
    category: str | None = None,
    q: str | None = None,
    limit: int = Query(default=5000, ge=1, le=10000),
) -> dict:
    try:
        client = _supabase()
        query = client.table("facilities").select(
            "facility_id,facility_name,category,address,source_x,source_y,source_crs,longitude,latitude,geom"
        )
        if category:
            query = query.eq("category_path", category)
        if q:
            query = query.ilike("facility_name", f"%{q}%")
        rows = query.order("facility_id").limit(limit).execute().data
    except Exception as error:
        _supabase_error(error, "facilities")

    items = []
    for row in rows:
        items.append({
            "id": row.get("facility_id"),
            "name": row.get("facility_name"),
            "category": row.get("category"),
            "address": row.get("address"),
            "sourceX": row.get("source_x"),
            "sourceY": row.get("source_y"),
            "sourceCrs": row.get("source_crs"),
            "longitude": row.get("longitude"),
            "latitude": row.get("latitude"),
            "geometry": _parse_geometry(row.get("geom")),
        })
    return {"items": items, "filters": {"adminCode": admin_code, "category": category, "q": q}, "count": len(items)}


@app.get("/api/v1/facilities/{facility_id}")
def facility_detail(facility_id: int) -> dict[str, object]:
    try:
        client = _supabase()
        facility_response = (
            client.table("facilities")
            .select("facility_id,facility_name,category,address,source_x,source_y,source_crs,longitude,latitude,geom")
            .eq("facility_id", facility_id)
            .limit(1)
            .execute()
        )
        if not facility_response.data:
            raise HTTPException(status_code=404, detail="Facility not found")

        attributes = (
            client.table("facility_attributes")
            .select("id,attribute_name,attribute_value,facility_name,created_at")
            .eq("facility_id", facility_id)
            .order("id")
            .limit(100)
            .execute()
            .data
        )
        links = client.table("trend_facilities").select("trend_id").eq("facility_id", facility_id).limit(100).execute().data
        trend_ids = [row["trend_id"] for row in links]
        trends = []
        if trend_ids:
            trends = (
                client.table("trends")
                .select("trend_id,title,trend_date,source_url,content_text")
                .in_("trend_id", trend_ids)
                .order("trend_date", desc=True)
                .limit(20)
                .execute()
                .data
            )
    except HTTPException:
        raise
    except Exception as error:
        _supabase_error(error, "facility detail")

    row = facility_response.data[0]
    return {
        "facility": {
            "id": row.get("facility_id"),
            "name": row.get("facility_name"),
            "category": row.get("category"),
            "address": row.get("address"),
            "longitude": row.get("longitude"),
            "latitude": row.get("latitude"),
            "geometry": _parse_geometry(row.get("geom")),
        },
        "attributes": attributes,
        "trends": trends,
    }


@app.get("/api/v1/facilities/{facility_id}/timeseries")
def facility_timeseries_api(facility_id: int, start_year: int = 2012, end_year: int = 2025) -> dict[str, object]:
    started = perf_counter()
    if start_year > end_year:
        raise HTTPException(status_code=422, detail="start_year must be less than or equal to end_year")
    try:
        client = _supabase()
        response = (
            client
            .table("facilities")
            .select("facility_id,facility_name")
            .eq("facility_id", facility_id)
            .limit(1)
            .execute()
        )
        if not response.data:
            raise HTTPException(status_code=404, detail="Facility not found")
        facility = response.data[0]
        stats = load_persisted_stats(client, facility_id, start_year, end_year)
        series = stats_to_timeseries(stats, start_year, end_year)
    except (HTTPException, ValueError):
        raise
    except Exception as error:
        _supabase_error(error, "facility persisted time series")
    logger.info("timeseries total: %.1f ms", (perf_counter() - started) * 1000)
    return {"facilityId": facility_id, "facilityName": facility["facility_name"], "series": series}


@app.get("/api/v1/facilities/{facility_id}/stats")
def facility_stats(facility_id: int, start_year: int = 2012, end_year: int = 2025) -> dict[str, object]:
    """Return persisted GEE statistics when the satellite stats tables are available."""
    if start_year > end_year:
        raise HTTPException(status_code=422, detail="start_year must be less than or equal to end_year")
    try:
        client = _supabase()
        stats = load_persisted_stats(client, facility_id, start_year, end_year)
    except Exception as error:
        message = str(error)
        if "nightlight_stats" in message or "forest_stats" in message:
            raise HTTPException(status_code=503, detail="Satellite stats tables are not available; apply the stats migration first")
        _supabase_error(error, "facility persisted stats")
    return {"facilityId": facility_id, "nightlight": stats["nightlight"], "forest": stats["forest"]}


@app.get("/api/v1/facilities/{facility_id}/analysis")
def facility_analysis(facility_id: int, start_year: int = 2012, end_year: int = 2025) -> dict[str, object]:
    started = perf_counter()
    stats = facility_stats(facility_id, start_year, end_year)
    nightlight = [row for row in stats["nightlight"] if row.get("mean_radiance") is not None]
    forest = [row for row in stats["forest"] if row.get("annual_loss_km2") is not None]
    if not nightlight and not forest:
        raise HTTPException(status_code=422, detail="No persisted satellite statistics are available")
    first = nightlight[0] if nightlight else None
    last = nightlight[-1] if nightlight else None
    change_pct = None
    if first and last and first.get("mean_radiance") not in (None, 0):
        change_pct = round((last["mean_radiance"] - first["mean_radiance"]) / first["mean_radiance"] * 100, 1)
    loss_total = round(sum(float(row["annual_loss_km2"]) for row in forest), 3) if forest else None
    direction = "증가" if (change_pct or 0) > 0 else "감소" if (change_pct or 0) < 0 else "변화가 거의 없음"
    summary = f"{start_year}~{end_year} 야간조도는 {direction}"
    if change_pct is not None:
        summary += f"({change_pct:+.1f}%)"
    if loss_total is not None:
        summary += f"이며, 같은 기간 산림손실은 {loss_total:.3f} km²로 집계되었습니다."
    else:
        summary += "입니다."
    observation = summary
    if loss_total is not None:
        observation += f" 산림손실 누적값은 {loss_total:.3f} km²입니다."
    interpretation = "야간 활동 또는 시설 가동 변화 가능성을 시사할 수 있으나, 단일 위성지표만으로 원인을 확정할 수 없습니다."
    if loss_total and loss_total > 0:
        interpretation += " 산림 변화가 함께 관측되어 토지이용 변화 자료와 추가 대조가 필요합니다."
    logger.info("analysis total: %.1f ms", (perf_counter() - started) * 1000)
    return {"facilityId": facility_id, "period": {"start": start_year, "end": end_year}, "summary": summary, "observation": observation, "interpretation": interpretation, "confidence": "관측 기반 참고", "sources": ["NOAA VIIRS DNB monthly", "Hansen Global Forest Change"], "nightlightChangePct": change_pct, "forestLossKm2": loss_total, "series": stats}


@app.post("/api/v1/reports", response_model=ReportJob, status_code=202)
def create_report(request: ReportRequest) -> ReportJob:
    report_id = str(uuid4())
    try:
        counts = data_status()["tables"]
        evidence = build_evidence_package(request.admin_code, request.period_start, request.period_end)
    except HTTPException:
        raise
    except Exception as error:
        _supabase_error(error, "report evidence")

    markdown = f"""# 평양 위성정보 변화 분석 보고서

## 분석 조건

- 대상 행정코드: `{request.admin_code}`
- 기간: `{request.period_start}` ~ `{request.period_end}`
- 지표: {", ".join(request.metrics)}

## 데이터 현황

| 데이터셋 | 건수 |
|---|---:|
| 행정경계 | {counts.get("admin_boundaries", 0)} |
| 시설물 | {counts.get("facilities", 0)} |
| 시설 속성 | {counts.get("facility_attributes", 0)} |
| 동향 | {counts.get("trends", 0)} |
| 동향-시설 연결 | {counts.get("trend_facilities", 0)} |

## 분석 메모

현재 보고서는 Supabase 적재 데이터와 GEE 타일을 기준으로 생성된 근거 패키지입니다. 수치 해석은 선택한 시설 및 시계열 결과가 연결된 뒤 확장됩니다.

처리 버전: `report-v1`
"""
    if request.facility_ids:
        markdown += "\n## Facility analysis\n\n"
        for raw_facility_id in request.facility_ids:
            try:
                analysis = facility_analysis(int(raw_facility_id), request.period_start.year, request.period_end.year)
                markdown += (
                    f"- Facility ID: `{raw_facility_id}`\n"
                    f"- Observation: {analysis['observation']}\n"
                    f"- Interpretation: {analysis['interpretation']}\n"
                    f"- Confidence: {analysis['confidence']}\n"
                    f"- Sources: {', '.join(analysis['sources'])}\n\n"
                )
            except HTTPException as error:
                markdown += f"- Facility ID `{raw_facility_id}`: analysis unavailable ({error.detail})\n\n"
    REPORTS[report_id] = {
        "id": report_id,
        "status": "completed",
        "markdown": markdown,
        "evidence": evidence,
    }
    return ReportJob(id=report_id, status="completed")


@app.get("/api/v1/reports/{report_id}")
def report_detail(report_id: str) -> dict[str, object]:
    report = REPORTS.get(report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


@app.get("/api/v1/reports/{report_id}/pdf")
def report_pdf(report_id: str) -> StreamingResponse:
    report = REPORTS.get(report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    markdown = str(report["markdown"])
    pdf = BytesIO()
    try:
        from weasyprint import HTML

        body = "<br>".join(escape(line) for line in markdown.splitlines())
        HTML(string=f"<html><body><h1>Pyongyang Satellite Report</h1><p>{body}</p></body></html>").write_pdf(pdf)
    except (ImportError, OSError):
        # Keep the endpoint usable on Windows hosts without WeasyPrint's native Pango DLL.
        text = "Pyongyang Satellite Report\\n\\n" + markdown.replace("#", "")
        stream = f"BT /F1 10 Tf 40 760 Td ({escape(text[:1800]).replace('(', '[').replace(')', ']')}) Tj ET".encode("latin-1", "replace")
        objects = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>", b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", b"<< /Length " + str(len(stream)).encode() + b" >>\\nstream\\n" + stream + b"\\nendstream"]
        pdf.write(b"%PDF-1.4\\n")
        offsets = [0]
        for index, obj in enumerate(objects, 1):
            offsets.append(pdf.tell())
            pdf.write(f"{index} 0 obj\\n".encode() + obj + b"\\nendobj\\n")
        startxref = pdf.tell()
        pdf.write(f"xref\\n0 {len(objects) + 1}\\n0000000000 65535 f \\n".encode())
        for offset in offsets[1:]:
            pdf.write(f"{offset:010d} 00000 n \\n".encode())
        pdf.write(f"trailer\\n<< /Size {len(objects) + 1} /Root 1 0 R >>\\nstartxref\\n{startxref}\\n%%EOF".encode())
    pdf.seek(0)
    return StreamingResponse(pdf, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=report-{report_id}.pdf"})
