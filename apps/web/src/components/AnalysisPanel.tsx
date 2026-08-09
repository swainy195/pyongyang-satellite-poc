import { useEffect, useState } from "react";
import { useAnalysisStore } from "../store";
import { apiBaseUrl } from "../api";

type NightlightPoint = { year: number; mean_radiance?: number | null };
type ForestPoint = { year: number; annual_loss_km2?: number | null; cumulative_loss_km2?: number | null };
type Analysis = {
  summary: string;
  observation: string;
  interpretation: string;
  confidence: string;
  sources: string[];
  period: { start: number; end: number };
  nightlightChangePct: number | null;
  forestLossKm2: number | null;
  series: { nightlight: NightlightPoint[]; forest: ForestPoint[] };
};
type FacilityDetail = {
  name: string;
  category?: string | null;
  address?: string | null;
  longitude?: number | null;
  latitude?: number | null;
};

function formatValue(value: number | null | undefined, digits = 2) {
  return value == null || !Number.isFinite(Number(value)) ? "-" : Number(value).toFixed(digits);
}

function formatPercent(value: number | null | undefined) {
  return value == null || !Number.isFinite(Number(value)) ? "-" : `${value > 0 ? "+" : ""}${Number(value).toFixed(1)}%`;
}

function SeriesChart({
  points,
  value,
  color,
  label,
  unit,
}: {
  points: Array<{ year: number; value: number | null | undefined }>;
  value: (point: { year: number; value: number | null | undefined }) => number;
  color: string;
  label: string;
  unit: string;
}) {
  const max = Math.max(...points.map(value), 0);
  const scale = max > 0 ? max : 1;
  return <div className="analysis-chart-wrap">
    <strong className="analysis-chart-title">{label}</strong>
    <div className="analysis-chart" role="img" aria-label={`${label} 그래프`}>
      {points.map((point) => <div className="analysis-bar" key={point.year} title={`${point.year}년 · ${formatValue(point.value)}${unit}`} aria-label={`${point.year}년, ${formatValue(point.value)}${unit}`}>
        <i style={{ height: `${Math.max(point.value == null ? 0 : 3, value(point) / scale * 100)}%`, background: color }} />
        <small>{point.year}</small>
      </div>)}
    </div>
  </div>;
}

export default function AnalysisPanel() {
  const focus = useAnalysisStore((state) => state.focusFacility);
  const [facility, setFacility] = useState<FacilityDetail | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "empty" | "error">("idle");

  useEffect(() => {
    if (!focus) {
      setFacility(null);
      setAnalysis(null);
      setStatus("idle");
      return;
    }

    const controller = new AbortController();
    setFacility({ name: focus.name, category: focus.category, address: focus.address, longitude: focus.longitude, latitude: focus.latitude });
    setAnalysis(null);
    setStatus("loading");

    const detailRequest = fetch(`${apiBaseUrl}/api/v1/facilities/${focus.id}`, { signal: controller.signal });
    const analysisRequest = fetch(`${apiBaseUrl}/api/v1/facilities/${focus.id}/analysis?start_year=2012&end_year=2025`, { signal: controller.signal });
    Promise.allSettled([detailRequest, analysisRequest]).then(async ([detailResult, analysisResult]) => {
      if (controller.signal.aborted) return;

      if (detailResult.status === "fulfilled" && detailResult.value.ok) {
        try {
          const detail = await detailResult.value.json() as { facility: FacilityDetail };
          setFacility(detail.facility);
        } catch (error) {
          console.error("Facility detail response parsing failed:", error);
        }
      } else {
        console.error("Facility detail request failed:", detailResult.status === "fulfilled" ? detailResult.value.status : detailResult.reason);
      }

      if (analysisResult.status === "fulfilled" && analysisResult.value.status === 422) {
        setStatus("empty");
        return;
      }
      if (analysisResult.status === "fulfilled" && analysisResult.value.ok) {
        try {
          setAnalysis(await analysisResult.value.json() as Analysis);
          setStatus("ready");
          return;
        } catch (error) {
          console.error("Facility analysis response parsing failed:", error);
        }
      } else {
        console.error("Facility analysis request failed:", analysisResult.status === "fulfilled" ? analysisResult.value.status : analysisResult.reason);
      }

      // Keep any successfully loaded facility metadata visible when only statistics fail.
      setStatus("error");
    });

    return () => controller.abort();
  }, [focus]);

  const nightlightPoints = analysis?.series.nightlight ?? [];
  const forestPoints = analysis?.series.forest ?? [];
  const firstNightlightPoint = nightlightPoints.find((point) => point.mean_radiance != null);
  const lastNightlightPoint = [...nightlightPoints].reverse().find((point) => point.mean_radiance != null);
  const firstNightlight = firstNightlightPoint?.mean_radiance;
  const lastNightlight = lastNightlightPoint?.mean_radiance;
  const nightlightDelta = firstNightlight != null && lastNightlight != null ? lastNightlight - firstNightlight : null;
  const cumulativeForestLoss = forestPoints.length > 0 ? forestPoints[forestPoints.length - 1].cumulative_loss_km2 : null;
  const period = analysis?.period ?? { start: 2012, end: 2025 };

  if (!focus || status === "idle") return null;
  return <aside className="analysis-panel" aria-live="polite">
    <div className="analysis-heading">
      <div><span className="analysis-eyebrow">선택 시설 분석</span><strong>{facility?.name ?? focus.name}</strong></div>
      <button type="button" onClick={() => useAnalysisStore.getState().setFocusFacility(null)} aria-label="분석 패널 닫기" title="분석 패널 닫기">×</button>
    </div>
    {facility && <div className="analysis-facility-meta">
      <span>{facility.category || "분류 정보 없음"}</span>
      <span>{facility.address || "주소 정보 없음"}</span>
      {facility.longitude != null && facility.latitude != null && <small>{Number(facility.longitude).toFixed(4)}, {Number(facility.latitude).toFixed(4)}</small>}
    </div>}
    <p className="analysis-guide">이 시설 주변에서 관측된 야간 불빛과 산림 변화를 확인해보세요.</p>

    {status === "loading" && <p className="analysis-status" role="status">시설 분석 정보를 불러오는 중...</p>}
    {status === "error" && <p className="analysis-status analysis-status-error" role="alert">시설 분석 정보를 불러오지 못했습니다.</p>}
    {status === "empty" && <p className="analysis-status" role="status">이 시설의 위성 통계가 아직 준비되지 않았습니다.</p>}

    {analysis && <>
      <div className="analysis-overview"><strong>핵심 변화</strong><p>{analysis.summary}</p></div>
      <div className="analysis-kpis" aria-label="핵심 분석 지표">
        <div><span>야간 불빛 변화</span><strong>{formatPercent(analysis.nightlightChangePct)}</strong><small>{period.start} → {period.end}년</small></div>
        <div><span>산림손실</span><strong>{formatValue(analysis.forestLossKm2, 3)} km²</strong><small>{period.start} → {period.end}년 누적</small></div>
      </div>

      <div className="analysis-detail-grid">
        <section className="analysis-detail-card"><strong>야간 불빛</strong><div><span>{firstNightlightPoint?.year ?? period.start}년</span><b>{formatValue(firstNightlight)}</b><span>→ {lastNightlightPoint?.year ?? period.end}년</span><b>{formatValue(lastNightlight)}</b></div><small>절대 변화량 {nightlightDelta == null ? "-" : `${nightlightDelta > 0 ? "+" : ""}${formatValue(nightlightDelta)}`} · Radiance</small></section>
        <section className="analysis-detail-card"><strong>산림 변화</strong><div><span>선택 기간 손실</span><b>{formatValue(analysis.forestLossKm2, 3)} km²</b></div><small>누적 손실 {formatValue(cumulativeForestLoss, 3)} km²</small></section>
      </div>

      <div className="analysis-section analysis-observation"><strong>관찰</strong><span className="analysis-section-hint">데이터에서 직접 확인된 내용</span><p>{analysis.observation}</p></div>
      <div className="analysis-section analysis-interpretation"><strong>해석</strong><span className="analysis-section-hint">관찰 결과를 바탕으로 한 참고 의견</span><p>{analysis.interpretation}</p></div>
      <div className="analysis-note"><strong>주의</strong><p>단일 위성지표만으로 시설 운영 여부나 변화 원인을 확정할 수 없습니다. 관련 자료와 함께 참고해주세요.</p></div>

      <SeriesChart points={nightlightPoints.map((point) => ({ year: point.year, value: point.mean_radiance }))} value={(point) => Number(point.value ?? 0)} color="#2563eb" label="VIIRS 야간 불빛 연도별 변화" unit=" Radiance" />
      <SeriesChart points={forestPoints.map((point) => ({ year: point.year, value: point.annual_loss_km2 }))} value={(point) => Number(point.value ?? 0)} color="#d97706" label="Hansen 산림손실 연도별 변화" unit=" km²" />

      <div className="analysis-sources"><strong>출처</strong><div className="analysis-meta"><span className="confidence-badge">{analysis.confidence}</span><span>시설정보 DB · NOAA VIIRS DNB · Hansen Global Forest Change</span></div></div>
    </>}
  </aside>;
}
