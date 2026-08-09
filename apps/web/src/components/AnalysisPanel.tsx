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
type Stats = { nightlight: NightlightPoint[]; forest: ForestPoint[] };
type Timeseries = { series: Array<{ year: number; nightlight?: number | null; forestLossKm2?: number | null }> };
type RelatedTrend = {
  id: number;
  date?: string | null;
  title?: string | null;
  summary?: string | null;
  category?: string | null;
  source?: string | null;
  source_url?: string | null;
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

function formatArea(value: number | null | undefined) {
  return value == null || !Number.isFinite(Number(value)) ? "데이터 없음" : `${Number(value).toFixed(3)} km²`;
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
  const baseYear = useAnalysisStore((state) => state.baseYear);
  const compareYear = useAnalysisStore((state) => state.compareYear);
  const [facility, setFacility] = useState<FacilityDetail | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [timeseries, setTimeseries] = useState<Timeseries | null>(null);
  const [detailStatus, setDetailStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [statsStatus, setStatsStatus] = useState<"idle" | "loading" | "ready" | "empty" | "error">("idle");
  const [timeseriesStatus, setTimeseriesStatus] = useState<"idle" | "loading" | "ready" | "empty" | "error">("idle");
  const [analysisStatus, setAnalysisStatus] = useState<"idle" | "loading" | "ready" | "empty" | "error">("idle");
  const [trends, setTrends] = useState<RelatedTrend[]>([]);
  const [trendsStatus, setTrendsStatus] = useState<"idle" | "loading" | "ready" | "empty" | "error">("idle");
  const [showAllTrends, setShowAllTrends] = useState(false);

  useEffect(() => {
    if (!focus) {
      setFacility(null);
      setAnalysis(null);
      setStats(null);
      setTimeseries(null);
      setDetailStatus("idle");
      setStatsStatus("idle");
      setTimeseriesStatus("idle");
      setAnalysisStatus("idle");
      return;
    }

    const controller = new AbortController();
    setFacility({ name: focus.name, category: focus.category, address: focus.address, longitude: focus.longitude, latitude: focus.latitude });
    setAnalysis(null);
    setDetailStatus("loading");
    setStatsStatus("loading");
    setTimeseriesStatus("loading");
    setAnalysisStatus("loading");

    const handleResponse = async <T,>(
      label: string,
      request: Promise<Response>,
      onSuccess: (value: T) => void,
      onStatus: (status: "ready" | "empty" | "error") => void,
    ) => {
      try {
        const response = await request;
        if (response.status === 422) {
          onStatus("empty");
          return;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        onSuccess(await response.json() as T);
        onStatus("ready");
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error(`${label} request failed:`, error);
        onStatus("error");
      }
    };

    void handleResponse<{ facility: FacilityDetail }>(
      "Facility detail",
      fetch(`${apiBaseUrl}/api/v1/facilities/${focus.id}`, { signal: controller.signal }),
      (value) => setFacility(value.facility),
      (value) => setDetailStatus(value === "empty" ? "error" : value),
    );
    void handleResponse<Stats>(
      "Facility stats",
      fetch(`${apiBaseUrl}/api/v1/facilities/${focus.id}/stats?start_year=2012&end_year=2025`, { signal: controller.signal }),
      setStats,
      (value) => setStatsStatus(value),
    );
    void handleResponse<Timeseries>(
      "Facility timeseries",
      fetch(`${apiBaseUrl}/api/v1/facilities/${focus.id}/timeseries?start_year=2012&end_year=2025`, { signal: controller.signal }),
      setTimeseries,
      (value) => setTimeseriesStatus(value),
    );
    void handleResponse<Analysis>(
      "Facility analysis",
      fetch(`${apiBaseUrl}/api/v1/facilities/${focus.id}/analysis?start_year=2012&end_year=2025`, { signal: controller.signal }),
      setAnalysis,
      (value) => setAnalysisStatus(value),
    );

    return () => controller.abort();
  }, [focus]);

  useEffect(() => {
    if (!focus) {
      setTrends([]);
      setTrendsStatus("idle");
      setShowAllTrends(false);
      return;
    }

    const controller = new AbortController();
    setTrends([]);
    setTrendsStatus("loading");
    setShowAllTrends(false);

    fetch(`${apiBaseUrl}/api/v1/facilities/${focus.id}/trends?start_year=${baseYear}&end_year=${compareYear}&limit=5`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 422) return { items: [] as RelatedTrend[] };
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json() as { items?: RelatedTrend[] };
      })
      .then((value) => {
        if (controller.signal.aborted) return;
        const items = value.items ?? [];
        setTrends(items);
        setTrendsStatus(items.length > 0 ? "ready" : "empty");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error("Facility related trends request failed:", error);
        setTrendsStatus("error");
      });

    return () => controller.abort();
  }, [focus, baseYear, compareYear]);

  const nightlightPoints: NightlightPoint[] = stats?.nightlight ?? analysis?.series.nightlight ?? timeseries?.series.map((point) => ({ year: point.year, mean_radiance: point.nightlight })) ?? [];
  const forestPoints: ForestPoint[] = stats?.forest ?? analysis?.series.forest ?? timeseries?.series.map((point) => ({ year: point.year, annual_loss_km2: point.forestLossKm2, cumulative_loss_km2: null })) ?? [];
  const firstNightlightPoint = nightlightPoints.find((point) => point.mean_radiance != null);
  const lastNightlightPoint = [...nightlightPoints].reverse().find((point) => point.mean_radiance != null);
  const firstNightlight = firstNightlightPoint?.mean_radiance;
  const lastNightlight = lastNightlightPoint?.mean_radiance;
  const nightlightDelta = firstNightlight != null && lastNightlight != null ? lastNightlight - firstNightlight : null;
  const cumulativeForestLoss = forestPoints.length > 0 ? forestPoints[forestPoints.length - 1].cumulative_loss_km2 : null;
  const nightlightChangePct = firstNightlight != null && firstNightlight !== 0 && lastNightlight != null ? (lastNightlight - firstNightlight) / firstNightlight * 100 : analysis?.nightlightChangePct ?? null;
  const forestLossTotal = stats?.forest.length
    ? stats.forest.reduce((total, point) => total + Number(point.annual_loss_km2 ?? 0), 0)
    : analysis?.forestLossKm2 ?? null;
  const period = analysis?.period ?? { start: 2012, end: 2025 };

  if (!focus) return null;
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

    {detailStatus === "loading" && <p className="analysis-status" role="status">시설 기본정보를 불러오는 중...</p>}
    {detailStatus === "error" && <p className="analysis-status analysis-status-error" role="alert">시설 기본정보를 불러오지 못했습니다.</p>}

    {(statsStatus === "loading" || statsStatus === "error" || statsStatus === "empty") && <p className={`analysis-status${statsStatus === "error" ? " analysis-status-error" : ""}`} role={statsStatus === "error" ? "alert" : "status"}>{statsStatus === "loading" ? "통계 정보를 불러오는 중..." : statsStatus === "empty" ? "이 시설의 위성 통계가 아직 준비되지 않았습니다." : "통계 정보를 불러오지 못했습니다."}</p>}
    {(analysis || stats || timeseries) && <>
      {analysis && <div className="analysis-overview"><strong>핵심 변화</strong><p>{analysis.summary}</p></div>}
      <div className="analysis-kpis" aria-label="핵심 분석 지표">
        <div><span>야간 불빛 변화</span><strong>{formatPercent(nightlightChangePct)}</strong><small>{period.start} → {period.end}년</small></div>
        <div><span>산림손실</span><strong>{formatArea(forestLossTotal)}</strong><small>{period.start} → {period.end}년 누적</small></div>
      </div>

      <div className="analysis-detail-grid">
        <section className="analysis-detail-card"><strong>야간 불빛</strong><div><span>{firstNightlightPoint?.year ?? period.start}년</span><b>{formatValue(firstNightlight)}</b><span>→ {lastNightlightPoint?.year ?? period.end}년</span><b>{formatValue(lastNightlight)}</b></div><small>절대 변화량 {nightlightDelta == null ? "-" : `${nightlightDelta > 0 ? "+" : ""}${formatValue(nightlightDelta)}`} · Radiance</small></section>
        <section className="analysis-detail-card"><strong>산림 변화</strong><div><span>선택 기간 손실</span><b>{formatArea(forestLossTotal)}</b></div><small>누적 손실 {formatArea(cumulativeForestLoss)}</small></section>
      </div>

      {analysis && <>
        <div className="analysis-section analysis-observation"><strong>관찰</strong><span className="analysis-section-hint">데이터에서 직접 확인된 내용</span><p>{analysis.observation}</p></div>
        <div className="analysis-section analysis-interpretation"><strong>해석</strong><span className="analysis-section-hint">관찰 결과를 바탕으로 한 참고 의견</span><p>{analysis.interpretation}</p></div>
      </>}
      <div className="analysis-note"><strong>주의</strong><p>단일 위성지표만으로 시설 운영 여부나 변화 원인을 확정할 수 없습니다. 관련 자료와 함께 참고해주세요.</p></div>

      <section className="analysis-section analysis-trends" aria-live="polite">
        <strong>관련 동향</strong>
        <span className="analysis-section-hint">위성 관측 결과와 함께 참고할 수 있는 공개 동향입니다.</span>
        {trendsStatus === "loading" && <p className="analysis-status" role="status">관련 동향을 불러오는 중...</p>}
        {trendsStatus === "error" && <p className="analysis-status analysis-status-error" role="alert">관련 동향을 불러오지 못했습니다.</p>}
        {trendsStatus === "empty" && <p className="analysis-status" role="status">이 시설과 연결된 관련 동향이 없습니다.</p>}
        {trendsStatus === "ready" && <>
          <p className="analysis-trends-intro">분석 기간 중 다음 관련 동향이 확인됩니다.</p>
          <div className="analysis-trend-list">
            {trends.slice(0, showAllTrends ? trends.length : 3).map((trend) => <article className="analysis-trend-card" key={trend.id}>
              <small>{trend.date ?? "날짜 없음"}{trend.category ? ` · ${trend.category}` : ""}</small>
              <strong>{trend.title ?? "제목 없음"}</strong>
              {trend.summary && <p>{trend.summary}</p>}
              {trend.source_url && <a href={trend.source_url} target="_blank" rel="noreferrer">원문 보기</a>}
            </article>)}
          </div>
          {trends.length > 3 && <button type="button" className="analysis-trends-more" onClick={() => setShowAllTrends((value) => !value)}>{showAllTrends ? "간단히 보기" : "관련 동향 더보기"}</button>}
        </>}
      </section>

      {timeseriesStatus === "error" ? <p className="analysis-status analysis-status-error" role="alert">시계열 그래프를 불러오지 못했습니다.</p> : timeseriesStatus === "empty" ? <p className="analysis-status" role="status">시계열 데이터가 없습니다.</p> : <>
        <SeriesChart points={nightlightPoints.map((point) => ({ year: point.year, value: point.mean_radiance }))} value={(point) => Number(point.value ?? 0)} color="#2563eb" label="VIIRS 야간 불빛 연도별 변화" unit=" Radiance" />
        <SeriesChart points={forestPoints.map((point) => ({ year: point.year, value: point.annual_loss_km2 }))} value={(point) => Number(point.value ?? 0)} color="#d97706" label="Hansen 산림손실 연도별 변화" unit=" km²" />
      </>}

      <div className="analysis-sources"><strong>출처</strong><div className="analysis-meta"><span className="confidence-badge">{analysis?.confidence ?? "관측 기반 데이터"}</span><span>시설정보 DB · NOAA VIIRS DNB · Hansen Global Forest Change</span></div></div>
    </>}
    {analysisStatus === "error" && <div className="analysis-section analysis-status-error" role="alert"><strong>관찰·해석</strong><p>분석 문장을 불러오지 못했습니다. 위의 통계와 시계열을 기준으로 확인해주세요.</p></div>}
    {analysisStatus === "empty" && <div className="analysis-section" role="status"><strong>관찰·해석</strong><p>이 시설의 분석 문장이 아직 준비되지 않았습니다.</p></div>}
  </aside>;
}
