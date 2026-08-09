import { useState } from "react";
import { useAnalysisStore, type CompareMode, type Metric } from "../store";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

type SearchResult = { id: number; name: string; category: string; longitude: number; latitude: number };

export default function LayerPanel() {
  const state = useAnalysisStore();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  async function searchFacilities(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) { setResults([]); return; }
    setSearching(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/facilities?q=${encodeURIComponent(trimmed)}&limit=20`);
      const payload = await response.json() as { items: SearchResult[] };
      setResults(payload.items ?? []);
    } finally {
      setSearching(false);
    }
  }

  return (
    <aside className="panel">
      <h2>분석 조건</h2>
      <form className="facility-search" onSubmit={searchFacilities}>
        <label>시설 검색<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="시설명을 입력하세요" /></label>
        <button type="submit">{searching ? "검색 중" : "검색"}</button>
      </form>
      {results.length > 0 && <ul className="search-results">
        {results.map((facility) => <li key={facility.id}>
          <button type="button" onClick={() => state.setFocusFacility(facility)}>
            <strong>{facility.name}</strong><small>{facility.category}</small>
          </button>
        </li>)}
      </ul>}
      {query.trim() && !searching && results.length === 0 && <p className="search-empty">검색 결과가 없습니다.</p>}
      <label>지표
        <select value={state.metric} onChange={(e) => state.setMetric(e.target.value as Metric)}>
          <option value="nightlight">야간조도</option><option value="forest">산림변화</option><option value="combined">종합 변화</option>
        </select>
      </label>
      <label>비교 방식
        <select value={state.mode} onChange={(e) => state.setMode(e.target.value as CompareMode)}>
          <option value="swipe">스와이프</option><option value="split">좌우 분할</option><option value="difference">변화량</option><option value="timeline">타임라인</option>
        </select>
      </label>
      <div className="years">
        <label>기준연도<input type="number" value={state.baseYear} onChange={(e) => state.setYears(Number(e.target.value), state.compareYear)} /></label>
        <label>비교연도<input type="number" value={state.compareYear} onChange={(e) => state.setYears(state.baseYear, Number(e.target.value))} /></label>
      </div>
      <fieldset><legend>레이어</legend>
        <label><input type="checkbox" checked={state.showBoundaries} onChange={(e) => state.setLayerVisible("boundaries", e.target.checked)} /> 행정경계</label>
        <label><input type="checkbox" checked={state.showTrends} onChange={(e) => state.setLayerVisible("trends", e.target.checked)} /> 위성 변화</label>
        <label><input type="checkbox" checked={state.showFacilities} onChange={(e) => state.setLayerVisible("facilities", e.target.checked)} /> 시설물</label>
      </fieldset>
      <div className="notice">VIIRS 야간조도와 Hansen 산림손실은 비교연도에 맞춰 지도에 표시됩니다. Hansen은 2025년까지 제공합니다.</div>
    </aside>
  );
}
