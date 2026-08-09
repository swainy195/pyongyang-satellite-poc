import { useEffect, useRef, useState } from "react";
import { useAnalysisStore, type CompareMode, type Metric } from "../store";
import { apiBaseUrl } from "../api";


type SearchResult = { id: number; name: string; category: string; longitude: number; latitude: number };
type SearchPhase = "idle" | "searching" | "retrying" | "error";

const SEARCH_TIMEOUT_MS = 70_000;
const SEARCH_RETRY_DELAY_MS = 1_500;

class SearchHttpError extends Error {
  constructor(public readonly status: number) {
    super(`Facility search failed with HTTP ${status}`);
    this.name = "SearchHttpError";
  }
}

function isRetryableSearchError(error: unknown) {
  if (error instanceof SearchHttpError) return [502, 503, 504].includes(error.status);
  return error instanceof TypeError || (error instanceof DOMException && error.name === "AbortError");
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export default function LayerPanel() {
  const state = useAnalysisStore();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [searchPhase, setSearchPhase] = useState<SearchPhase>("idle");
  const requestIdRef = useRef(0);
  const activeControllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    requestIdRef.current += 1;
    activeControllerRef.current?.abort();
  }, []);

  async function searchFacilities(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || searching) {
      if (!trimmed) { setResults([]); setSearchError(false); setSearchPhase("idle"); }
      return;
    }
    const requestId = ++requestIdRef.current;
    activeControllerRef.current?.abort();
    setSearching(true);
    setSearchError(false);
    setSearchPhase("searching");
    try {
      let payload: { items: SearchResult[] } | null = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (attempt > 0) setSearchPhase("retrying");
        const controller = new AbortController();
        activeControllerRef.current = controller;
        const timeoutId = window.setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
        try {
          const response = await fetch(
            `${apiBaseUrl}/api/v1/facilities?q=${encodeURIComponent(trimmed)}&limit=20`,
            { signal: controller.signal },
          );
          if (!response.ok) throw new SearchHttpError(response.status);
          payload = await response.json() as { items: SearchResult[] };
          break;
        } catch (error) {
          if (requestId !== requestIdRef.current) return;
          if (attempt === 0 && isRetryableSearchError(error)) {
            await wait(SEARCH_RETRY_DELAY_MS);
            continue;
          }
          throw error;
        } finally {
          window.clearTimeout(timeoutId);
        }
      }
      if (requestId === requestIdRef.current && payload) {
        setResults(payload.items ?? []);
        setSearchError(false);
        setSearchPhase("idle");
      }
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      console.error("Facility search failed", error);
      setSearchError(true);
      setSearchPhase("error");
    } finally {
      if (requestId === requestIdRef.current) setSearching(false);
    }
  }

  return (
    <aside className="panel" aria-label="분석 설정">
      <h2>분석 설정</h2>

      <section className="control-group" aria-labelledby="target-heading">
        <h3 id="target-heading">대상 선택</h3>
        <form className="facility-search" onSubmit={searchFacilities}>
          <label htmlFor="facility-query">시설 검색</label>
          <div className="search-row">
            <input id="facility-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="시설명을 입력하세요" />
            <button type="submit" disabled={searching} aria-label="시설 검색">{searching ? "검색 중..." : "검색"}</button>
          </div>
        </form>
        {results.length > 0 && <ul className="search-results" aria-label="시설 검색 결과">
          {results.map((facility) => <li key={facility.id}>
            <button type="button" onClick={() => state.setFocusFacility(facility)}>
              <strong>{facility.name}</strong><small>{facility.category}</small>
            </button>
          </li>)}
        </ul>}
        {searching && <p className="search-status" role="status">{searchPhase === "retrying" ? "검색 서버를 준비하고 있습니다. 잠시만 기다려주세요." : "시설을 검색하고 있습니다."}</p>}
        {query.trim() && !searching && searchError && <p className="search-empty" role="alert">검색 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.</p>}
        {query.trim() && !searching && !searchError && results.length === 0 && <p className="search-empty">검색 결과가 없습니다.</p>}
      </section>

      <section className="control-group" aria-labelledby="analysis-heading">
        <h3 id="analysis-heading">분석 조건</h3>
        <label htmlFor="metric-select">지표
          <select id="metric-select" value={state.metric} onChange={(e) => state.setMetric(e.target.value as Metric)}>
            <option value="nightlight">야간조도</option><option value="forest">산림변화</option><option value="combined">종합 변화</option>
          </select>
        </label>
        <div className="years">
          <label htmlFor="base-year">기준연도<input id="base-year" type="number" value={state.baseYear} onChange={(e) => state.setYears(Number(e.target.value), state.compareYear)} /></label>
          <label htmlFor="compare-year">비교연도<input id="compare-year" type="number" value={state.compareYear} onChange={(e) => state.setYears(state.baseYear, Number(e.target.value))} /></label>
        </div>
        <label htmlFor="mode-select">비교 방식
          <select id="mode-select" value={state.mode} onChange={(e) => state.setMode(e.target.value as CompareMode)}>
            <option value="swipe">스와이프</option><option value="split">좌우 분할</option><option value="difference">변화량</option><option value="timeline">타임라인</option>
          </select>
        </label>
      </section>

      <section className="control-group" aria-labelledby="display-heading">
        <h3 id="display-heading">표시 옵션</h3>
        <fieldset>
          <legend className="sr-only">지도 레이어</legend>
          <label><input type="checkbox" checked={state.showBoundaries} onChange={(e) => state.setLayerVisible("boundaries", e.target.checked)} /> 행정경계</label>
          <label><input type="checkbox" checked={state.showTrends} onChange={(e) => state.setLayerVisible("trends", e.target.checked)} /> 위성 변화</label>
          <label><input type="checkbox" checked={state.showFacilities} onChange={(e) => state.setLayerVisible("facilities", e.target.checked)} /> 시설물</label>
        </fieldset>
      </section>

      <div className="notice" role="note">
        <strong>데이터 안내</strong>
        <ul><li>VIIRS 야간조도는 선택한 비교연도 기준으로 표시됩니다.</li><li>Hansen 산림변화 데이터는 2025년까지 제공됩니다.</li></ul>
      </div>
    </aside>
  );
}
