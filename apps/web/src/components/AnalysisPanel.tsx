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
    <div className="analysis-heading"><strong>{focus.name}</strong><button type="button" onClick={() => useAnalysisStore.getState().setFocusFacility(null)} aria-label="분석 패널 닫기">×</button></div>
    {status && <p>{status}</p>}
    {analysis && <>
      <p className="analysis-summary">{analysis.summary}</p>
      <div className="analysis-section"><strong>관찰</strong><p>{analysis.observation}</p></div>
      <div className="analysis-section"><strong>해석</strong><p>{analysis.interpretation}</p></div>
      <div className="analysis-meta"><span>{analysis.confidence}</span><span>{analysis.sources.join(" · ")}</span></div>
      <div className="analysis-kpis"><span>조도 변화<strong>{analysis.nightlightChangePct == null ? "-" : `${analysis.nightlightChangePct > 0 ? "+" : ""}${analysis.nightlightChangePct}%`}</strong></span><span>산림손실<strong>{analysis.forestLossKm2 == null ? "-" : `${analysis.forestLossKm2} km²`}</strong></span></div>
      <div className="analysis-chart">{points.map((point) => <div className="analysis-bar" key={point.year} title={`${point.year}: ${point.mean_radiance ?? "-"}`}><i style={{ height: `${Math.max(3, Number(point.mean_radiance ?? 0) / max * 100)}%` }} /><small>{point.year}</small></div>)}</div>
    </>}
  </aside>;
}
