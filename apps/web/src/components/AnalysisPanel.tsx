import { useEffect, useState } from "react";
import { useAnalysisStore } from "../store";
import { apiBaseUrl } from "../api";

type Point = { year: number; mean_radiance?: number | null; annual_loss_km2?: number | null };

export default function AnalysisPanel() {
  const focus = useAnalysisStore((state) => state.focusFacility);
  const [analysis, setAnalysis] = useState<{ summary: string; observation: string; interpretation: string; confidence: string; sources: string[]; nightlightChangePct: number | null; forestLossKm2: number | null; series: { nightlight: Point[]; forest: Point[] } } | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!focus) { setAnalysis(null); return; }
    setStatus("통계 분석 중...");
    fetch(`${apiBaseUrl}/api/v1/facilities/${focus.id}/analysis?start_year=2012&end_year=2025`)
      .then(async (response) => { if (!response.ok) throw new Error(); return response.json(); })
      .then((value) => { setAnalysis(value); setStatus(""); })
      .catch(() => setStatus("통계 적재 후 분석 결과가 표시됩니다."));
  }, [focus]);

  if (!focus || (!analysis && !status)) return null;
  const points = analysis?.series.nightlight ?? [];
  const max = Math.max(...points.map((point) => Number(point.mean_radiance ?? 0)), 1);
  return <aside className="analysis-panel" aria-live="polite">
    <div className="analysis-heading"><div><span className="analysis-eyebrow">선택한 시설</span><strong>{focus.name}</strong></div><button type="button" onClick={() => useAnalysisStore.getState().setFocusFacility(null)} aria-label="분석 패널 닫기" title="분석 패널 닫기">×</button></div>
    <p className="analysis-guide">이 시설 주변의 위성 변화와 시간 흐름을 확인해보세요.</p>
    {status && <p>{status}</p>}
    {analysis && <>
      <div className="analysis-overview"><strong>한눈에 보기</strong><p>{analysis.summary}</p></div>
      <div className="analysis-kpis" aria-label="핵심 분석 지표">
        <div><span>야간조도 관측값 변화</span><strong>{analysis.nightlightChangePct == null ? "-" : `${analysis.nightlightChangePct > 0 ? "+" : ""}${analysis.nightlightChangePct}%`}</strong></div>
        <div><span>산림손실</span><strong>{analysis.forestLossKm2 == null ? "-" : `${analysis.forestLossKm2} km²`}</strong></div>
      </div>
      <div className="analysis-section analysis-observation"><strong>관찰</strong><span className="analysis-section-hint">데이터에서 직접 확인된 내용</span><p>{analysis.observation}</p></div>
      <div className="analysis-section analysis-interpretation"><strong>해석</strong><span className="analysis-section-hint">관찰 결과를 바탕으로 한 참고 의견</span><p>{analysis.interpretation}</p></div>
      <div className="analysis-note"><strong>주의</strong><p>위성자료만으로 시설 운영 원인이나 정책적 결론을 단정하지 않습니다. 관련 자료와 함께 참고해주세요.</p></div>
      <div className="analysis-sources"><strong>출처</strong><div className="analysis-meta"><span className="confidence-badge">{analysis.confidence}</span><span>{analysis.sources.join(" · ")}</span></div></div>
      <div className="analysis-chart-wrap">
        <strong className="analysis-chart-title">VIIRS 야간조도 연도별 변화</strong>
        <div className="analysis-chart" role="img" aria-label="VIIRS 야간조도 연도별 변화 그래프">{points.map((point) => <div className="analysis-bar" key={point.year} title={`${point.year}년 · Radiance: ${point.mean_radiance ?? "-"}`} aria-label={`${point.year}년, Radiance ${point.mean_radiance ?? "-"}`}><i style={{ height: `${Math.max(3, Number(point.mean_radiance ?? 0) / max * 100)}%` }} /><small>{point.year}</small></div>)}</div>
      </div>
    </>}
  </aside>;
}
