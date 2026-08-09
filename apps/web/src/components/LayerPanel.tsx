import { useEffect, useRef, useState } from "react";
import { useAnalysisStore, type CompareMode, type Metric } from "../store";
import { isFacilityIndexLoaded, searchFacilityIndex, type SearchResult } from "../services/facilitySearch";

type SearchPhase = "idle" | "loading" | "searching" | "error";

const recommendedFacilities: SearchResult[] = [
  { id: 320344, name: "동평양화력발전소", category: "산업·경제 · 전력", longitude: 125.686465866344, latitude: 38.9701345501362 },
  { id: 328586, name: "평양화력발전소", category: "산업·경제 · 전력", longitude: 125.711888016558, latitude: 39.0100040495103 },
  { id: 9682, name: "남포항", category: "산업·경제 · 항만", longitude: 125.416308801679, latitude: 38.7299837874235 },
];

const metricOptions: Array<{ value: Metric; title: string; description: string }> = [
  { value: "nightlight", title: "야간 불빛 변화", description: "밤의 밝기 변화를 비교합니다." },
  { value: "forest", title: "산림 변화", description: "산림 감소와 변화 흐름을 확인합니다." },
  { value: "combined", title: "종합 분석", description: "시설 정보와 위성 변화를 함께 봅니다." },
];

export default function LayerPanel() {
  const state = useAnalysisStore();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [searchPhase, setSearchPhase] = useState<SearchPhase>("idle");
  const requestIdRef = useRef(0);

  useEffect(() => () => {
    requestIdRef.current += 1;
  }, []);

  async function searchFacilities(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || searching) {
      if (!trimmed) { setResults([]); setSearchError(false); setSearchPhase("idle"); }
      return;
    }
    const requestId = ++requestIdRef.current;
    setSearching(true);
    setSearchError(false);
    setSearchPhase(isFacilityIndexLoaded() ? "searching" : "loading");
    try {
      const matches = await searchFacilityIndex(trimmed);
      if (requestId === requestIdRef.current) {
        setResults(matches);
        setSearchError(false);
        setSearchPhase("idle");
      }
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      console.error("Facility search index failed", error);
      setSearchError(true);
      setSearchPhase("error");
    } finally {
      if (requestId === requestIdRef.current) setSearching(false);
    }
  }

  return (
    <aside className="panel" aria-label="위성 변화 탐색 설정">
      <div className="panel-intro">
        <span className="panel-kicker">위성정보 탐색</span>
        <h2>어디를 살펴볼까요?</h2>
        <p>시설을 선택하면 과거와 최근의 변화를 지도와 분석 결과로 확인할 수 있습니다.</p>
      </div>

      <section className="control-group target-group" aria-labelledby="target-heading">
        <div className="section-step">1</div>
        <div className="section-content">
          <h3 id="target-heading">시설 선택</h3>
          <form className="facility-search" onSubmit={searchFacilities}>
            <label htmlFor="facility-query">어떤 시설을 살펴볼까요?</label>
            <div className="search-row">
              <input id="facility-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="시설명을 입력해보세요" />
              <button type="submit" disabled={searching} aria-label="시설 검색">{searching ? "검색 중" : "검색"}</button>
            </div>
          </form>
          {results.length > 0 && <ul className="search-results" aria-label="시설 검색 결과">
            {results.map((facility) => <li key={facility.id}>
              <button type="button" onClick={() => state.setFocusFacility(facility)}>
                <strong>{facility.name}</strong><small>{facility.category}</small>
              </button>
            </li>)}
          </ul>}
          {searching && <p className="search-status" role="status">{searchPhase === "loading" ? "시설 검색을 준비하고 있습니다..." : "시설을 검색하고 있습니다."}</p>}
          {query.trim() && !searching && searchError && <p className="search-empty" role="alert">시설 검색 데이터를 불러오지 못했습니다.</p>}
          {query.trim() && !searching && !searchError && results.length === 0 && <p className="search-empty">검색 결과가 없습니다.</p>}

          <div className="recommended-block">
            <div className="subsection-heading"><strong>추천 시설</strong><span>바로 분석해보기</span></div>
            <div className="recommended-list">
              {recommendedFacilities.map((facility) => <button key={facility.id} type="button" className="recommended-card" onClick={() => state.setFocusFacility(facility)}>
                <strong>{facility.name}</strong><small>{facility.category}</small><span>변화 확인 →</span>
              </button>)}
            </div>
          </div>
        </div>
      </section>

      <section className="control-group metric-group" aria-labelledby="metric-heading">
        <div className="section-step">2</div>
        <div className="section-content">
          <h3 id="metric-heading">무엇을 비교할까요?</h3>
          <div className="metric-cards" role="group" aria-label="분석 지표 선택">
            {metricOptions.map((option) => <button key={option.value} type="button" className={`metric-card${state.metric === option.value ? " is-selected" : ""}`} aria-pressed={state.metric === option.value} onClick={() => state.setMetric(option.value)}>
              <strong>{option.title}</strong><span>{option.description}</span>
            </button>)}
          </div>
        </div>
      </section>

      <details className="advanced-settings">
        <summary>세부 분석 설정</summary>
        <div className="advanced-content">
          <label htmlFor="metric-select">분석 지표
            <select id="metric-select" value={state.metric} onChange={(e) => state.setMetric(e.target.value as Metric)}>
              <option value="nightlight">야간 불빛 변화</option><option value="forest">산림 변화</option><option value="combined">종합 분석</option>
            </select>
          </label>
          <div className="years">
            <label htmlFor="base-year">기준 연도<input id="base-year" type="number" value={state.baseYear} onChange={(e) => state.setYears(Number(e.target.value), state.compareYear)} /></label>
            <label htmlFor="compare-year">비교 연도<input id="compare-year" type="number" value={state.compareYear} onChange={(e) => state.setYears(state.baseYear, Number(e.target.value))} /></label>
          </div>
          <label htmlFor="mode-select">비교 방식
            <select id="mode-select" value={state.mode} onChange={(e) => state.setMode(e.target.value as CompareMode)}>
              <option value="swipe">좌우로 비교</option><option value="split">좌우 분할</option><option value="difference">변화량</option><option value="timeline">시간 흐름</option>
            </select>
          </label>
          <fieldset>
            <legend>지도에 표시할 정보</legend>
            <label><input type="checkbox" checked={state.showBoundaries} onChange={(e) => state.setLayerVisible("boundaries", e.target.checked)} /> 행정경계</label>
            <label><input type="checkbox" checked={state.showTrends} onChange={(e) => state.setLayerVisible("trends", e.target.checked)} /> 위성 변화</label>
            <label><input type="checkbox" checked={state.showFacilities} onChange={(e) => state.setLayerVisible("facilities", e.target.checked)} /> 시설물</label>
          </fieldset>
        </div>
      </details>

      <div className="notice" role="note">
        <strong>데이터 안내</strong>
        <ul><li>야간 불빛은 선택한 비교 연도 기준으로 표시됩니다.</li><li>산림 변화 데이터는 2025년까지 제공됩니다.</li></ul>
      </div>
    </aside>
  );
}
