import { useEffect, useRef, useState } from "react";
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
  return value == null || !Number.isFinite(Number(value)) ? "산림 변화 데이터가 없습니다." : `${Number(value).toFixed(3)} km²`;
}

function formatPercent(value: number | null | undefined) {
  return value == null || !Number.isFinite(Number(value)) ? "-" : `${value > 0 ? "+" : ""}${Number(value).toFixed(1)}%`;
}

function formatTrendDate(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 10).replaceAll("-", ".");
}

const RETRY_DELAYS = [1_000, 2_000];
const RETRYABLE_STATUSES = new Set([502, 503, 504]);

function waitForRetry(delay: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      window.clearTimeout(timeoutId);
      reject(new DOMException("Request aborted", "AbortError"));
    };
    const timeoutId = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delay);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit,
  signal: AbortSignal,
  onRetry: () => void,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (signal.aborted) throw new DOMException("Request aborted", "AbortError");
    const timeoutController = new AbortController();
    const abortTimeout = () => timeoutController.abort();
    const timeoutId = window.setTimeout(abortTimeout, 15_000);
    signal.addEventListener("abort", abortTimeout, { once: true });
    try {
      const response = await fetch(input, { ...init, signal: timeoutController.signal });
      if (!RETRYABLE_STATUSES.has(response.status) || attempt === 2) return response;
      onRetry();
    } catch (error) {
      if (signal.aborted) throw new DOMException("Request aborted", "AbortError");
      if (attempt === 2) throw error;
      onRetry();
    } finally {
      window.clearTimeout(timeoutId);
      signal.removeEventListener("abort", abortTimeout);
    }
    await waitForRetry(RETRY_DELAYS[attempt], signal);
  }
  throw new Error("Request retry limit exceeded");
}

function SeriesChart({
  points,
  value,
  color,
  label,
  unit,
  hideZeroBars = false,
  emptyMessage,
}: {
  points: Array<{ year: number; value: number | null | undefined }>;
  value: (point: { year: number; value: number | null | undefined }) => number;
  color: string;
  label: string;
  unit: string;
  hideZeroBars?: boolean;
  emptyMessage?: string;
}) {
  const max = Math.max(...points.map(value), 0);
  const scale = max > 0 ? max : 1;
  return <div className={`analysis-chart-wrap${emptyMessage ? " analysis-chart-wrap-empty" : ""}`}>
    <strong className="analysis-chart-title">{label}</strong>
    {emptyMessage && <span className="analysis-chart-empty-message">{emptyMessage}</span>}
    <div className="analysis-chart" role="img" aria-label={`${label} 그래프`}>
      {points.map((point) => <div className="analysis-bar" key={point.year} title={`${point.year}년 · ${formatValue(point.value)}${unit}`} aria-label={`${point.year}년, ${formatValue(point.value)}${unit}`}>
        {(!hideZeroBars || (point.value != null && value(point) > 0)) && <i style={{ height: `${Math.max(point.value == null ? 0 : 3, value(point) / scale * 100)}%`, background: color }} />}
        <small>{point.year}</small>
      </div>)}
    </div>
  </div>;
}

export default function AnalysisPanel() {
  const focus = useAnalysisStore((state) => state.focusFacility);
  const analysisPanelOpen = useAnalysisStore((state) => state.analysisPanelOpen);
  const metric = useAnalysisStore((state) => state.metric);
  const selectedMetric = useAnalysisStore((state) => state.selectedMetric);
  const baseYear = useAnalysisStore((state) => state.baseYear);
  const compareYear = useAnalysisStore((state) => state.compareYear);
  const [facility, setFacility] = useState<FacilityDetail | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [timeseries, setTimeseries] = useState<Timeseries | null>(null);
  const [detailStatus, setDetailStatus] = useState<"idle" | "loading" | "retrying" | "ready" | "error">("idle");
  const [statsStatus, setStatsStatus] = useState<"idle" | "loading" | "retrying" | "ready" | "empty" | "error">("idle");
  const [timeseriesStatus, setTimeseriesStatus] = useState<"idle" | "loading" | "retrying" | "ready" | "empty" | "error">("idle");
  const [analysisStatus, setAnalysisStatus] = useState<"idle" | "loading" | "retrying" | "ready" | "empty" | "error">("idle");
  const [trends, setTrends] = useState<RelatedTrend[]>([]);
  const [trendsStatus, setTrendsStatus] = useState<"idle" | "loading" | "retrying" | "ready" | "empty" | "error">("idle");
  const [showAllTrends, setShowAllTrends] = useState(false);
  const analysisRequestId = useRef(0);
  const lazyRequestId = useRef(0);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    const requestId = ++analysisRequestId.current;
    if (!focus) {
      setFacility(null);
      setAnalysis(null);
      setStats(null);
      setTimeseries(null);
      setTrends([]);
      setDetailStatus("idle");
      setStatsStatus("idle");
      setTimeseriesStatus("idle");
      setAnalysisStatus("idle");
      setTrendsStatus("idle");
      return;
    }

    const detailController = new AbortController();
    const statsController = new AbortController();
    const trendsController = new AbortController();
    setFacility({ name: focus.name, category: focus.category, address: focus.address, longitude: focus.longitude, latitude: focus.latitude });
    setAnalysis(null);
    setStats(null);
    setTimeseries(null);
    setTrends([]);
    setDetailStatus("loading");
    setStatsStatus("loading");
    setTimeseriesStatus("idle");
    setAnalysisStatus("idle");
    setTrendsStatus("loading");
    setShowAllTrends(false);

    const handleResponse = async <T,>(
      label: string,
      request: RequestInfo | URL,
      controller: AbortController,
      onSuccess: (value: T) => void,
      onStatus: (status: "ready" | "empty" | "error") => void,
      setRetrying: () => void,
    ) => {
      try {
        const response = await fetchWithRetry(request, {}, controller.signal, setRetrying);
        if (response.status === 422) {
          onStatus("empty");
          return;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        onSuccess(await response.json() as T);
        onStatus("ready");
      } catch (error) {
        if (controller.signal.aborted || analysisRequestId.current !== requestId) return;
        console.error(`${label} request failed:`, error);
        onStatus("error");
      }
    };

    void handleResponse<{ facility: FacilityDetail }>(
      "Facility detail",
      `${apiBaseUrl}/api/v1/facilities/${focus.id}`,
      detailController,
      (value) => setFacility(value.facility),
      (value) => setDetailStatus(value === "empty" ? "error" : value),
      () => setDetailStatus("retrying"),
    );
    void handleResponse<Stats>(
      "Facility stats",
      `${apiBaseUrl}/api/v1/facilities/${focus.id}/stats?start_year=${baseYear}&end_year=${compareYear}`,
      statsController,
      setStats,
      (value) => setStatsStatus(value),
      () => setStatsStatus("retrying"),
    );
    void handleResponse<{ items?: RelatedTrend[] }>(
      "Facility related trends",
      `${apiBaseUrl}/api/v1/facilities/${focus.id}/trends?start_year=${baseYear}&end_year=${compareYear}&limit=5`,
      trendsController,
      (value) => {
        const items = value.items ?? [];
        setTrends(items);
        setTrendsStatus(items.length > 0 ? "ready" : "empty");
      },
      () => undefined,
      () => setTrendsStatus("retrying"),
    );

    return () => {
      detailController.abort();
      statsController.abort();
      trendsController.abort();
    };
  }, [focus, baseYear, compareYear, retryNonce]);

  useEffect(() => {
    const requestId = ++lazyRequestId.current;
    if (!focus) return;
    const controllers: AbortController[] = [];
    const isCurrent = () => !controllers[0]?.signal.aborted && lazyRequestId.current === requestId;
    const handleLazyResponse = async <T,>(label: string, url: string, setValue: (value: T) => void, setStatus: (status: "ready" | "empty" | "error") => void, setRetrying: () => void) => {
      const controller = new AbortController();
      controllers.push(controller);
      try {
        const response = await fetchWithRetry(url, {}, controller.signal, setRetrying);
        if (response.status === 422) { if (isCurrent()) setStatus("empty"); return; }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (isCurrent()) { setValue(await response.json() as T); setStatus("ready"); }
      } catch (error) {
        if (!isCurrent()) return;
        console.error(`${label} request failed:`, error);
        setStatus("error");
      }
    };
    if (selectedMetric === "nightlight" || selectedMetric === "forest") {
      setTimeseries(null);
      setTimeseriesStatus("loading");
      void handleLazyResponse<Timeseries>("Facility timeseries", `${apiBaseUrl}/api/v1/facilities/${focus.id}/timeseries?start_year=${baseYear}&end_year=${compareYear}`, setTimeseries, setTimeseriesStatus, () => setTimeseriesStatus("retrying"));
    } else {
      setTimeseriesStatus("idle");
    }
    if (selectedMetric === "combined") {
      setAnalysis(null);
      setAnalysisStatus("loading");
      void handleLazyResponse<Analysis>("Facility analysis", `${apiBaseUrl}/api/v1/facilities/${focus.id}/analysis?start_year=${baseYear}&end_year=${compareYear}`, setAnalysis, setAnalysisStatus, () => setAnalysisStatus("retrying"));
    } else {
      setAnalysisStatus("idle");
    }
    return () => controllers.forEach((controller) => controller.abort());
  }, [focus, baseYear, compareYear, selectedMetric, retryNonce]);

  const nightlightPoints: NightlightPoint[] = stats?.nightlight ?? analysis?.series.nightlight ?? timeseries?.series.map((point) => ({ year: point.year, mean_radiance: point.nightlight })) ?? [];
  const forestPoints: ForestPoint[] = stats?.forest ?? analysis?.series.forest ?? timeseries?.series.map((point) => ({ year: point.year, annual_loss_km2: point.forestLossKm2, cumulative_loss_km2: null })) ?? [];
  const firstNightlightPoint = nightlightPoints.find((point) => point.mean_radiance != null);
  const lastNightlightPoint = [...nightlightPoints].reverse().find((point) => point.mean_radiance != null);
  const firstNightlight = firstNightlightPoint?.mean_radiance;
  const lastNightlight = lastNightlightPoint?.mean_radiance;
  const nightlightDelta = firstNightlight != null && lastNightlight != null ? lastNightlight - firstNightlight : null;
  const nightlightChangePct = firstNightlight != null && firstNightlight !== 0 && lastNightlight != null ? (lastNightlight - firstNightlight) / firstNightlight * 100 : analysis?.nightlightChangePct ?? null;
  const hasForestObservations = forestPoints.some((point) => point.annual_loss_km2 != null) || analysis?.forestLossKm2 != null;
  const forestLossTotal = stats?.forest.length
    ? hasForestObservations ? stats.forest.reduce((total, point) => total + Number(point.annual_loss_km2 ?? 0), 0) : null
    : analysis?.forestLossKm2 ?? null;
  const cumulativeForestLoss = forestPoints.length > 0
    ? [...forestPoints].reverse().find((point) => point.cumulative_loss_km2 != null)?.cumulative_loss_km2 ?? (hasForestObservations ? forestLossTotal : null)
    : hasForestObservations ? forestLossTotal : null;
  const hasObservedForestLoss = forestPoints.some((point) => Number(point.annual_loss_km2) > 0);
  const period = { start: baseYear, end: compareYear };

  if (!analysisPanelOpen) return null;
  if (!focus) {
    return metric === "combined" ? <aside className="analysis-panel analysis-panel-empty" aria-live="polite">
      <span className="analysis-eyebrow">종합 분석</span>
      <strong>시설을 선택해주세요</strong>
      <p>시설을 선택하면 야간 불빛, 산림 변화, 관련 동향을 한 화면에서 함께 확인할 수 있습니다.</p>
    </aside> : null;
  }
  const isSummary = selectedMetric == null;
  const isNightlight = selectedMetric === "nightlight";
  const isForest = selectedMetric === "forest";
  const isCombined = selectedMetric === "combined";
  const representativeTrend = trendsStatus === "ready" && trends.length > 0 ? trends[0] : null;
  const retryData = () => setRetryNonce((value) => value + 1);
  const integratedObservation = `분석 기간 동안 시설 주변의 야간 불빛 변화와 산림 상태를 함께 확인할 수 있습니다. ${forestLossTotal === 0 ? "같은 기간 산림손실은 관측되지 않았습니다." : forestLossTotal == null ? "산림 변화 데이터는 확인이 필요합니다." : "같은 기간 일부 산림손실이 관측되었습니다."} ${trendsStatus === "ready" ? "연결된 공개 동향도 함께 참고할 수 있습니다." : "관련 동향은 별도 자료로 확인할 수 있습니다."}`;
  return <aside className={`analysis-panel${isCombined ? " analysis-panel-integrated" : ""}${isSummary ? " analysis-panel-summary" : ""}`} aria-live="polite">
    {detailStatus === "retrying" || statsStatus === "retrying" || trendsStatus === "retrying" || timeseriesStatus === "retrying" || analysisStatus === "retrying" ? <p className="analysis-status analysis-status-retry" role="status">⟳ 연결이 지연되어 다시 불러오는 중입니다...</p> : null}
    {detailStatus === "loading" ? <p className="analysis-status" role="status">시설 정보를 불러오는 중...</p> : null}
    {detailStatus === "error" || statsStatus === "error" || trendsStatus === "error" || timeseriesStatus === "error" || analysisStatus === "error" ? <p className="analysis-status analysis-status-error" role="alert">일부 정보를 불러오지 못했습니다. <button type="button" onClick={retryData}>다시 시도</button></p> : null}
    <div className="analysis-heading">
      <div><span className="analysis-eyebrow">{isCombined ? "종합 분석" : "선택 시설 분석"}</span><strong>{facility?.name ?? focus.name}</strong></div>
      <button type="button" onClick={() => useAnalysisStore.getState().setAnalysisPanelOpen(false)} aria-label="분석 패널 닫기" title="분석 패널 닫기">×</button>
    </div>
    {facility && <div className="analysis-facility-meta">
      <span>{facility.category || "분류 정보 없음"}</span>
      <span>{facility.address || "주소 정보 없음"}</span>
      {facility.longitude != null && facility.latitude != null && <small>{Number(facility.longitude).toFixed(4)}, {Number(facility.latitude).toFixed(4)}</small>}
    </div>}
    <p className="analysis-guide">{isForest && hasForestObservations && forestLossTotal === 0
      ? `선택한 시설 주변에서는 ${baseYear}~${compareYear}년 동안 산림손실이 관측되지 않았습니다.`
      : isForest && !hasForestObservations
        ? "산림 변화 데이터가 없습니다."
        : isNightlight
          ? "이 시설 주변에서 관측된 야간 불빛 변화를 확인해보세요."
          : "이 시설 주변에서 관측된 야간 불빛과 산림 변화를 확인해보세요."}</p>

    {detailStatus === "loading" && <p className="analysis-status" role="status">시설 기본정보를 불러오는 중...</p>}
    {detailStatus === "error" && <p className="analysis-status analysis-status-error" role="alert">시설 기본정보를 불러오지 못했습니다.</p>}

    {(statsStatus === "loading" || statsStatus === "error" || statsStatus === "empty") && <p className={`analysis-status${statsStatus === "error" ? " analysis-status-error" : ""}`} role={statsStatus === "error" ? "alert" : "status"}>{statsStatus === "loading" ? "통계 정보를 불러오는 중..." : statsStatus === "empty" ? "이 시설의 위성 통계가 아직 준비되지 않았습니다." : "통계 정보를 불러오지 못했습니다."}</p>}
    {isSummary && <>
      <p className="analysis-guide analysis-guide-summary">{"\uC9C0\uB3C4\uC5D0\uC11C \uD655\uC778\uD560 \uBD84\uC11D \uD56D\uBAA9\uC744 \uC120\uD0DD\uD574\uC8FC\uC138\uC694."}</p>
      <div className="analysis-summary-trend">
        <div className="analysis-summary-trend-header">
          <span>관련 동향</span>
          <strong>{trendsStatus === "idle" ? "준비 중..." : trendsStatus === "loading" || trendsStatus === "retrying" ? "불러오는 중..." : trendsStatus === "ready" || trendsStatus === "empty" ? `${trends.length}건` : "확인 불가"}</strong>
        </div>
        {representativeTrend && <div className="analysis-summary-trend-item">
          <small>{formatTrendDate(representativeTrend.date)}</small>
          <strong title={representativeTrend.title ?? ""}>{representativeTrend.title ?? ""}</strong>
        </div>}
      </div>
    </>}

    {(analysis || stats || timeseries) && <>
      {isCombined && analysis && <div className="analysis-overview"><strong>핵심 변화</strong><p>{analysis.summary}</p></div>}
      <div className={`analysis-kpis${isCombined ? " is-integrated" : ""}`} aria-label="핵심 분석 지표">
        {(isSummary || isNightlight || isCombined) && <div><span>야간 불빛 변화</span><strong>{formatPercent(nightlightChangePct)}</strong><small>{period.start} → {period.end}년</small></div>}
        {(isSummary || isForest || isCombined) && <div><span>산림손실</span><strong>{formatArea(forestLossTotal)}</strong><small>{period.start} → {period.end}년 누적</small></div>}
        {isCombined && <div><span>관련 동향</span><strong>{trendsStatus === "ready" ? `${trends.length}건` : "-"}</strong><small>분석 기간 기준</small></div>}
      </div>
      <div className="analysis-detail-grid">
        {(isNightlight || isCombined) && <section className="analysis-detail-card"><strong>야간 불빛</strong><div><span>{firstNightlightPoint?.year ?? period.start}년</span><b>{formatValue(firstNightlight)}</b><span>→ {lastNightlightPoint?.year ?? period.end}년</span><b>{formatValue(lastNightlight)}</b></div><small>절대 변화량 {nightlightDelta == null ? "-" : `${nightlightDelta > 0 ? "+" : ""}${formatValue(nightlightDelta)}`} · Radiance</small></section>}
        {(isForest || isCombined) && <section className="analysis-detail-card"><strong>산림 변화</strong><div><span>선택 기간 산림손실</span><b>{formatArea(forestLossTotal)}</b></div><small>누적 산림손실 {formatArea(cumulativeForestLoss)}</small></section>}
      </div>

      {isForest && hasForestObservations && forestLossTotal === 0 && <div className="analysis-forest-zero" role="status">선택한 시설 주변에서<br />{baseYear}~{compareYear}년 Hansen 기준 산림손실이<br />관측되지 않았습니다.</div>}

      {isCombined && analysis && <>
        {isCombined && <div className="analysis-section analysis-integrated-observation"><strong>종합 관찰</strong><span className="analysis-section-hint">기존 위성 통계와 연결된 공개 동향을 함께 정리한 내용</span><p>{integratedObservation}</p></div>}
        <div className="analysis-section analysis-observation"><strong>관찰</strong><span className="analysis-section-hint">데이터에서 직접 확인된 내용</span><p>{analysis.observation}</p></div>
        <div className="analysis-section analysis-interpretation"><strong>해석</strong><span className="analysis-section-hint">관찰 결과를 바탕으로 한 참고 의견</span><p>{analysis.interpretation}</p></div>
      </>}
      {isCombined && <div className="analysis-note"><strong>주의</strong><p>위성 관측값과 관련 동향은 시설 주변 변화를 살펴보기 위한 참고 자료입니다. 단일 지표나 동향만으로 시설 운영 상태, 정책 변화, 원인을 확정할 수 없습니다.</p></div>}

      {isCombined && <section id="facility-related-trends" className="analysis-section analysis-trends" aria-live="polite">
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
      </section>}

      {timeseriesStatus === "error" ? <p className="analysis-status analysis-status-error" role="alert">일부 정보를 불러오지 못했습니다. <button type="button" onClick={retryData}>다시 시도</button></p> : timeseriesStatus === "empty" ? <p className="analysis-status" role="status">시계열 데이터가 없습니다.</p> : <>
        {(isCombined || selectedMetric === "nightlight") && <SeriesChart points={nightlightPoints.map((point) => ({ year: point.year, value: point.mean_radiance }))} value={(point) => Number(point.value ?? 0)} color="#2563eb" label="VIIRS 야간 불빛 연도별 변화" unit=" Radiance" />}
        {(isCombined || selectedMetric === "forest") && <SeriesChart points={forestPoints.map((point) => ({ year: point.year, value: point.annual_loss_km2 }))} value={(point) => Number(point.value ?? 0)} color="#d97706" label="Hansen 산림손실 연도별 변화" unit=" km²" hideZeroBars emptyMessage={!hasObservedForestLoss ? (hasForestObservations ? "산림손실이 관측되지 않았습니다." : "산림 변화 데이터가 없습니다.") : undefined} />}
      </>}

      <div className="analysis-sources"><strong>출처</strong><div className="analysis-meta"><span className="confidence-badge">{analysis?.confidence ?? "관측 기반 데이터"}</span><span>{isNightlight ? "시설정보 DB · NOAA VIIRS DNB" : isForest ? "시설정보 DB · Hansen Global Forest Change" : "시설정보 DB · NOAA VIIRS DNB · Hansen Global Forest Change · 관련 동향 데이터"}</span></div></div>
      {isCombined && <div className="analysis-evidence-links"><strong>근거 상세보기</strong><div><button type="button" onClick={() => useAnalysisStore.getState().setMetric("nightlight")}>야간 불빛 상세 보기</button><button type="button" onClick={() => useAnalysisStore.getState().setMetric("forest")}>산림 변화 상세 보기</button><button type="button" onClick={() => document.getElementById("facility-related-trends")?.scrollIntoView({ behavior: "smooth", block: "nearest" })}>관련 동향 보기</button></div></div>}
    </>}
    {isCombined && analysisStatus === "error" && <div className="analysis-section analysis-status-error" role="alert"><strong>관찰·해석</strong><p>분석 문장을 불러오지 못했습니다. 위의 통계와 시계열을 기준으로 확인해주세요.</p></div>}
    {isCombined && analysisStatus === "empty" && <div className="analysis-section" role="status"><strong>관찰·해석</strong><p>이 시설의 분석 문장이 아직 준비되지 않았습니다.</p></div>}
  </aside>;
}
