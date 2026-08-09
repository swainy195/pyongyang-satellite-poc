import { useState } from "react";
import MapCanvas from "./components/MapCanvas";
import LayerPanel from "./components/LayerPanel";
import AnalysisPanel from "./components/AnalysisPanel";
import { useAnalysisStore } from "./store";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8001";
const metricLabels = { nightlight: "야간조도 변화", forest: "산림변화", combined: "종합 변화" } as const;
const modeLabels = { swipe: "스와이프 비교", split: "좌우 분할", difference: "변화량", timeline: "타임라인" } as const;

export default function App() {
  const state = useAnalysisStore();
  const [reportStatus, setReportStatus] = useState("");

  const changeYear = (delta: number) => {
    state.setYears(state.baseYear, Math.max(2012, Math.min(2025, state.compareYear + delta)));
  };

  const createReport = async () => {
    setReportStatus("보고서 생성 중...");
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          admin_code: "ALL",
          period_start: `${state.baseYear}-01-01`,
          period_end: `${state.compareYear}-12-31`,
          facility_ids: state.focusFacility ? [String(state.focusFacility.id)] : [],
          metrics: [state.metric],
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const job = await response.json();
      setReportStatus("보고서 생성 완료");
      window.open(`${apiBaseUrl}/api/v1/reports/${job.id}/pdf`, "_blank", "noopener,noreferrer");
    } catch {
      setReportStatus("보고서 생성 실패");
    }
  };

  const reportHint = state.focusFacility ? "선택한 시설의 분석보고서를 생성합니다." : "시설을 선택하면 분석보고서를 생성할 수 있습니다.";

  return (
    <main className="layout">
      <header>
        <div><h1>평양 위성정보 변화 분석</h1><p>VIIRS 야간조도 · Hansen 산림변화 · 북한정보포털</p></div>
        <div className="header-actions">
          {reportStatus && <span role="status">{reportStatus}</span>}
          <button type="button" onClick={createReport} disabled={!state.focusFacility} title={reportHint} aria-label={reportHint}>분석보고서 생성</button>
        </div>
      </header>
      <LayerPanel />
      <section className="map-area">
        <MapCanvas />
        <AnalysisPanel />
        <div className="map-caption"><strong>{metricLabels[state.metric]}</strong><span>{state.baseYear}년 → {state.compareYear}년 · {modeLabels[state.mode]}</span></div>
        <div className="legend"><strong>{state.metric === "nightlight" ? "VIIRS 야간조도" : state.metric === "forest" ? "Hansen 산림변화" : "위성 변화 종합"}</strong><div className="legend-bar" /><span>낮음 <em>Radiance / 변화량</em> 높음</span></div>
      </section>
      <footer>
        <button type="button" onClick={() => changeYear(-1)} title="이전 연도">이전</button>
        <span className="year-control-label">현재 연도: <strong>{state.compareYear}년</strong></span>
        <input aria-label="비교연도 탐색" type="range" min="2012" max="2025" value={state.compareYear} onChange={(e) => changeYear(Number(e.target.value) - state.compareYear)} />
        <button type="button" onClick={() => changeYear(-1)} title="연도 재생">재생</button><button type="button" onClick={() => changeYear(1)} title="다음 연도">다음</button>
      </footer>
    </main>
  );
}
