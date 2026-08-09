import { useState } from "react";
import MapCanvas from "./components/MapCanvas";
import LayerPanel from "./components/LayerPanel";
import AnalysisPanel from "./components/AnalysisPanel";
import { useAnalysisStore } from "./store";
import { apiBaseUrl } from "./api";

const metricLabels = { nightlight: "야간조도 변화", forest: "산림변화", combined: "종합 변화" } as const;
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
        <div className="brand-block"><span className="brand-kicker">북한 위성정보 분석 서비스</span><h1>북한의 변화를 위성으로 살펴보세요</h1><p>주요 시설을 찾고, 과거와 최근의 야간 불빛·산림 변화를 비교할 수 있습니다.</p></div>
        <div className="header-actions">
          {reportStatus && <span role="status">{reportStatus}</span>}
          <button type="button" onClick={createReport} disabled={!state.focusFacility} title={reportHint} aria-label={reportHint}>분석 보고서 만들기</button>
        </div>
      </header>
      <LayerPanel />
      <section className="map-area">
        <MapCanvas />
        <AnalysisPanel />
        <div className="map-caption"><strong>{state.mode === "swipe" && state.metric === "nightlight" ? "야간 불빛 비교" : state.mode === "difference" && state.metric === "nightlight" ? "야간 불빛 변화" : metricLabels[state.metric]}</strong>{state.mode === "swipe" ? <small>가운데 손잡이를 좌우로 움직여 비교해보세요.</small> : state.mode === "difference" && state.metric === "nightlight" ? <><span>{`${state.baseYear}년 → ${state.compareYear}년`}</span><small>따뜻한색은 밝아진 곳, 차가운색은 어두워진 곳입니다.</small></> : <span>{`${state.baseYear}년 기준 → ${state.compareYear}년`}</span>}</div>
        <div className={`legend${state.mode === "difference" ? " legend-difference" : ""}`}><strong>{state.metric === "nightlight" && state.mode === "difference" ? "야간 불빛 변화" : state.metric === "nightlight" ? "야간 불빛 밝기" : state.metric === "forest" ? "산림 변화" : "위성 변화 종합"}</strong><span className="legend-source">{state.metric === "nightlight" ? "NOAA VIIRS DNB" : state.metric === "forest" ? "Hansen Global Forest Change" : "VIIRS · Hansen"}</span><div className="legend-bar" /><span>{state.metric === "nightlight" && state.mode === "difference" ? "어두워짐" : state.metric === "nightlight" ? "어두움" : "낮음"} <em>{state.metric === "nightlight" && state.mode === "difference" ? "변화 적음" : state.metric === "nightlight" ? "밝기" : "변화량"}</em> {state.metric === "nightlight" && state.mode === "difference" ? "밝아짐" : state.metric === "nightlight" ? "밝음" : "높음"}</span><small className="legend-helper">{state.mode === "difference" && state.metric === "nightlight" ? <>cyan/blue: 어두워짐<br />gray: 변화 적음 · orange: 밝아짐<br />두 연도의 야간 불빛 관측값 차이입니다.</> : <>● 주요 시설 위치<br />클릭하면 시설별 변화 분석을 볼 수 있습니다.<br />{state.metric === "nightlight" ? "왼쪽과 오른쪽의 밝기를 직접 비교해보세요." : "지도 색상은 위성 관측값입니다."}</>}</small></div>
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
