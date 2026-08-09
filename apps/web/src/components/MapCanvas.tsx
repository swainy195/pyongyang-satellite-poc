import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { useAnalysisStore } from "../store";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

async function updateNightlightLayer(
  map: maplibregl.Map,
  year: number,
  visible: boolean,
  metric: string,
) {
  const layerId = "viirs-nightlight";
  const shouldShow = visible && (metric === "nightlight" || metric === "combined");
  if (!shouldShow) {
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", "none");
    return;
  }

  const response = await fetch(`${apiBaseUrl}/api/v1/map/tiles/nightlight/${year}`);
  if (!response.ok) return;
  const payload = await response.json() as { tiles: string[] };
  const sourceId = "viirs-nightlight-source";
  const source = map.getSource(sourceId);
  if (source && "setTiles" in source) {
    (source as maplibregl.RasterTileSource).setTiles(payload.tiles);
  } else if (!source) {
    map.addSource(sourceId, { type: "raster", tiles: payload.tiles, tileSize: 256 });
    map.addLayer({
      id: layerId,
      type: "raster",
      source: sourceId,
      paint: { "raster-opacity": 0.62 },
    });
  }
  if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", "visible");
}

async function updateForestLayer(
  map: maplibregl.Map,
  year: number,
  visible: boolean,
  metric: string,
) {
  const layerId = "hansen-forest-loss";
  const shouldShow = visible && (metric === "forest" || metric === "combined") && year <= 2025;
  if (!shouldShow) {
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", "none");
    return;
  }

  const response = await fetch(`${apiBaseUrl}/api/v1/map/tiles/forest/${year}`);
  if (!response.ok) return;
  const payload = await response.json() as { tiles: string[] };
  const sourceId = "hansen-forest-source";
  const source = map.getSource(sourceId);
  if (source && "setTiles" in source) {
    (source as maplibregl.RasterTileSource).setTiles(payload.tiles);
  } else if (!source) {
    map.addSource(sourceId, { type: "raster", tiles: payload.tiles, tileSize: 256 });
    map.addLayer({
      id: layerId,
      type: "raster",
      source: sourceId,
      paint: { "raster-opacity": 0.58 },
    });
  }
  if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", "visible");
}

async function updateBaseRasterLayer(
  map: maplibregl.Map,
  type: "nightlight" | "forest",
  year: number,
  visible: boolean,
  metric: string,
) {
  const isNightlight = type === "nightlight";
  const shouldShow = visible && (metric === type || metric === "combined") && (!isNightlight ? year <= 2025 : true);
  const layerId = isNightlight ? "viirs-nightlight-base" : "hansen-forest-base";
  const sourceId = `${layerId}-source`;
  if (!shouldShow) {
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", "none");
    return;
  }
  const response = await fetch(`${apiBaseUrl}/api/v1/map/tiles/${isNightlight ? "nightlight" : "forest"}/${year}`);
  if (!response.ok) return;
  const payload = await response.json() as { tiles: string[] };
  const source = map.getSource(sourceId);
  if (source && "setTiles" in source) {
    (source as maplibregl.RasterTileSource).setTiles(payload.tiles);
  } else if (!source) {
    map.addSource(sourceId, { type: "raster", tiles: payload.tiles, tileSize: 256 });
    map.addLayer({ id: layerId, type: "raster", source: sourceId, paint: { "raster-opacity": 0.42 } });
  }
  if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", "visible");
}

function applyComparisonOpacity(map: maplibregl.Map, mode: string) {
  const baseOpacity = mode === "split" ? 0.5 : mode === "difference" ? 0.08 : 0.35;
  const compareOpacity = mode === "split" ? 0.5 : mode === "difference" ? 0.85 : 0.62;
  for (const id of ["viirs-nightlight-base", "hansen-forest-base"]) {
    if (map.getLayer(id)) map.setPaintProperty(id, "raster-opacity", baseOpacity);
  }
  for (const id of ["viirs-nightlight", "hansen-forest-loss"]) {
    if (map.getLayer(id)) map.setPaintProperty(id, "raster-opacity", compareOpacity);
  }
}

export default function MapCanvas() {
  const { showBoundaries, showFacilities, showTrends, baseYear, compareYear, metric, mode, focusFacility } = useAnalysisStore();
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const focusPopup = useRef<maplibregl.Popup | null>(null);
  useEffect(() => {
    if (!container.current || map.current) return;
    map.current = new maplibregl.Map({
      container: container.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      center: [125.75, 39.03],
      zoom: 9,
      attributionControl: false,
    });
    map.current.addControl(new maplibregl.NavigationControl(), "top-right");

    map.current.once("load", () => {
      void updateNightlightLayer(map.current!, compareYear, showTrends, metric).catch(() => undefined);
      void updateForestLayer(map.current!, compareYear, showTrends, metric).catch(() => undefined);
      void updateBaseRasterLayer(map.current!, "nightlight", baseYear, showTrends, metric).catch(() => undefined);
      void updateBaseRasterLayer(map.current!, "forest", baseYear, showTrends, metric).catch(() => undefined);
      applyComparisonOpacity(map.current!, mode);
      void Promise.all([
        fetch(`${apiBaseUrl}/api/v1/admin-boundaries`).then((response) => response.ok ? response.json() : ({ type: "FeatureCollection", features: [] })),
        fetch(`${apiBaseUrl}/api/v1/facilities`).then((response) => response.ok ? response.json() : ({ items: [] })),
      ]).then(([boundaries, facilities]) => {
        const currentMap = map.current;
        if (!currentMap) return;

        currentMap.addSource("admin-boundaries", {
          type: "geojson",
          data: boundaries,
        });
        currentMap.addLayer({
          id: "admin-boundaries-fill",
          type: "fill",
          source: "admin-boundaries",
          paint: { "fill-color": "#2dd4bf", "fill-opacity": 0.08 },
        });
        currentMap.addLayer({
          id: "admin-boundaries-line",
          type: "line",
          source: "admin-boundaries",
          paint: { "line-color": "#0f766e", "line-width": 1.2 },
        });

        const facilityFeatures = (facilities.items ?? []).map((item: { id: number; geometry: unknown; name: string; category: string }) => ({
          type: "Feature",
          geometry: item.geometry,
          properties: { id: item.id, name: item.name, category: item.category },
        }));
        currentMap.addSource("facilities", {
          type: "geojson",
          data: { type: "FeatureCollection", features: facilityFeatures },
        });
        currentMap.addLayer({
          id: "facilities-points",
          type: "circle",
          source: "facilities",
          paint: {
            "circle-color": "#2563eb",
            "circle-radius": 4,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1,
          },
        });
        currentMap.on("mouseenter", "facilities-points", () => { currentMap.getCanvas().style.cursor = "pointer"; });
        currentMap.on("mouseleave", "facilities-points", () => { currentMap.getCanvas().style.cursor = ""; });
        currentMap.on("click", "facilities-points", async (event) => {
          const feature = event.features?.[0];
          const facilityId = feature?.properties?.id;
          if (!facilityId) return;
          const popup = new maplibregl.Popup({ maxWidth: "340px" })
            .setLngLat(event.lngLat)
            .setHTML("<strong>시설 정보를 불러오는 중...</strong>")
            .addTo(currentMap);
          try {
            const response = await fetch(`${apiBaseUrl}/api/v1/facilities/${facilityId}`);
            if (!response.ok) throw new Error("facility request failed");
            const detail = await response.json() as {
              facility: { name: string; category: string; address: string };
              attributes: Array<{ attribute_name: string; attribute_value: string }>;
              trends: Array<{ title: string; trend_date: string; source_url: string; content_text: string }>;
            };
            const seriesResponse = await fetch(`${apiBaseUrl}/api/v1/facilities/${facilityId}/timeseries?start_year=2012&end_year=2025`);
            const series = seriesResponse.ok ? (await seriesResponse.json() as { series: Array<{ year: number; nightlight?: number; forestLossKm2?: number }> }).series : [];
            const attributes = detail.attributes.slice(0, 8).map((item) => `<li>${escapeHtml(item.attribute_name)}: ${escapeHtml(item.attribute_value)}</li>`).join("");
            const trends = detail.trends.slice(0, 5).map((item) => `<li>${escapeHtml(item.trend_date)} · ${escapeHtml(item.title)}</li>`).join("");
            const timeline = series.slice(-5).map((item) => `<li>${item.year}: 조도 ${item.nightlight == null ? "-" : item.nightlight.toFixed(2)} · 산림손실 ${item.forestLossKm2 == null ? "-" : item.forestLossKm2.toFixed(3)} km²</li>`).join("");
            popup.setHTML(`
              <div class="facility-popup">
                <strong>${escapeHtml(detail.facility.name)}</strong>
                <div>${escapeHtml(detail.facility.category)}</div>
                <div>${escapeHtml(detail.facility.address)}</div>
                ${attributes ? `<h4>속성</h4><ul>${attributes}</ul>` : ""}
                ${trends ? `<h4>관련 동향</h4><ul>${trends}</ul>` : ""}
                ${timeline ? `<h4>최근 시계열</h4><ul>${timeline}</ul>` : ""}
              </div>
            `);
          } catch {
            popup.setHTML("<strong>시설 정보를 불러오지 못했습니다.</strong>");
          }
        });
      }).catch(() => undefined);
    });
    return () => { map.current?.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    if (!map.current?.isStyleLoaded()) return;
    void updateNightlightLayer(map.current, compareYear, showTrends, metric).catch(() => undefined);
    void updateForestLayer(map.current, compareYear, showTrends, metric).catch(() => undefined);
    void updateBaseRasterLayer(map.current, "nightlight", baseYear, showTrends, metric).catch(() => undefined);
    void updateBaseRasterLayer(map.current, "forest", baseYear, showTrends, metric).catch(() => undefined);
    applyComparisonOpacity(map.current, mode);
  }, [baseYear, compareYear, showTrends, metric, mode]);
  useEffect(() => {
    if (!map.current || !focusFacility) return;
    map.current.flyTo({ center: [focusFacility.longitude, focusFacility.latitude], zoom: 12, duration: 800 });
    focusPopup.current?.remove();
    focusPopup.current = new maplibregl.Popup({ closeButton: true })
      .setLngLat([focusFacility.longitude, focusFacility.latitude])
      .setHTML(`<strong>${escapeHtml(focusFacility.name)}</strong><div>시설물을 클릭하면 상세 정보를 확인할 수 있습니다.</div>`)
      .addTo(map.current);
  }, [focusFacility]);
  useEffect(() => {
    const currentMap = map.current;
    if (!currentMap) return;
    if (currentMap.getLayer("admin-boundaries-fill")) {
      currentMap.setLayoutProperty("admin-boundaries-fill", "visibility", showBoundaries ? "visible" : "none");
      currentMap.setLayoutProperty("admin-boundaries-line", "visibility", showBoundaries ? "visible" : "none");
    }
    if (currentMap.getLayer("facilities-points")) {
      currentMap.setLayoutProperty("facilities-points", "visibility", showFacilities ? "visible" : "none");
    }
  }, [showBoundaries, showFacilities]);
  return <div className="map" ref={container} aria-label="평양 위성정보 비교 지도" />;
}
