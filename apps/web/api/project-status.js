const defaultBackendUrl = "https://pyongyang-satellite-poc.onrender.com";

async function checkJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { response, body };
}

export default async function handler(req, res) {
  const backendUrl = (process.env.BACKEND_URL || defaultBackendUrl).replace(/\/$/, "");
  const status = {
    service: "평양 위성정보 분석 PoC",
    status: "running",
    frontend: {
      provider: "Vercel",
      status: "ok",
      url: "https://pyongyang-satellite-poc.vercel.app/",
    },
    backend: { provider: "Render", url: backendUrl, status: "unknown" },
    database: { provider: "Supabase", status: "unknown" },
    data: { status: "unknown", tables: null },
    satellite: {
      platform: "Google Earth Engine",
      datasets: ["VIIRS Nighttime Lights", "Hansen Global Forest Change"],
      status: "unknown",
    },
    implementation: {
      current_phase: "데이터 및 API 연동",
      next_tasks: [
        "Supabase 원격 스키마와 로컬 migration 비교",
        "누락 테이블 및 RLS 정리",
        "시설물 기반 공간 분석 API 연결",
        "VIIRS 및 Hansen 통계 연결",
        "프론트엔드 지도와 분석 결과 연동",
      ],
    },
    deployment: {
      commit_sha: process.env.VERCEL_GIT_COMMIT_SHA || null,
      environment: process.env.VERCEL_ENV || null,
    },
    checked_at: new Date().toISOString(),
  };

  try {
    const health = await checkJson(`${backendUrl}/health`);
    status.backend.status = health.response.ok ? "ok" : "error";
    status.backend.http_status = health.response.status;
    if (health.body) status.backend.details = health.body;
  } catch (error) {
    status.backend.status = "error";
    status.backend.error = error instanceof Error ? error.message : "Backend request failed";
  }

  try {
    const db = await checkJson(`${backendUrl}/health/db`);
    status.database.status = db.response.ok && db.body?.connected ? "ok" : "error";
    status.database.http_status = db.response.status;
    if (db.body) status.database.details = db.body;
  } catch (error) {
    status.database.status = "error";
    status.database.error = error instanceof Error ? error.message : "Database request failed";
  }

  try {
    const data = await checkJson(`${backendUrl}/api/v1/data-status`);
    status.data.status = data.response.ok ? "ok" : "error";
    status.satellite.http_status = data.response.status;
    if (data.body) status.data.tables = data.body.tables || data.body;
  } catch (error) {
    status.data.status = "error";
    status.data.error = error instanceof Error ? error.message : "Data status request failed";
  }

  try {
    const gee = await checkJson(`${backendUrl}/api/v1/gee-status`);
    status.satellite.status = gee.response.ok && gee.body?.status === "ok" ? "ok" : "degraded";
    status.satellite.http_status = gee.response.status;
    if (gee.body) status.satellite.details = gee.body;
  } catch (error) {
    status.satellite.status = "error";
    status.satellite.error = error instanceof Error ? error.message : "GEE status request failed";
  }

  status.status = status.backend.status === "ok" && status.database.status === "ok" ? "ok" : "degraded";
  res.status(200).json(status);
}
