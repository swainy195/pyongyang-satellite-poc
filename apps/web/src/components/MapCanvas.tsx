import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { useAnalysisStore } from "../store";
import { apiBaseUrl } from "../api";
import SwipeControl from "./SwipeControl";


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
  if (!response.ok) throw new Error(`VIIRS tile metadata HTTP ${response.status}`);
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
    }, map.getLayer("swipe-compare-clip-end") ? "swipe-compare-clip-end" : undefined);
  }
  if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", "visible");
}

async function updateNightlightDifferenceLayer(
  map: maplibregl.Map,
  baseYear: number,
  compareYear: number,
  visible: boolean,
  metric: string,
) {
  const layerId = "viirs-nightlight-difference";
  const shouldShow = visible && metric === "nightlight";
  if (!shouldShow) {
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", "none");
    return;
  }

  const response = await fetch(`${apiBaseUrl}/api/v1/map/tiles/nightlight/difference?base_year=${baseYear}&compare_year=${compareYear}`);
  if (!response.ok) throw new Error(`VIIRS difference tile metadata HTTP ${response.status}`);
  const payload = await response.json() as { tiles: string[] };
  const sourceId = "viirs-nightlight-difference-source";
  const source = map.getSource(sourceId);
  if (source && "setTiles" in source) {
    (source as maplibregl.RasterTileSource).setTiles(payload.tiles);
  } else if (!source) {
    map.addSource(sourceId, { type: "raster", tiles: payload.tiles, tileSize: 256 });
    const beforeId = map.getLayer("admin-boundaries-fill") ? "admin-boundaries-fill" : map.getLayer("facilities-points") ? "facilities-points" : undefined;
    map.addLayer({ id: layerId, type: "raster", source: sourceId, paint: { "raster-opacity": 0.82 } }, beforeId);
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
  if (!response.ok) throw new Error(`Hansen tile metadata HTTP ${response.status}`);
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
    }, map.getLayer("swipe-compare-clip-end") ? "swipe-compare-clip-end" : undefined);
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
  if (!response.ok) throw new Error(`${type} tile metadata HTTP ${response.status}`);
  const payload = await response.json() as { tiles: string[] };
  const source = map.getSource(sourceId);
  if (source && "setTiles" in source) {
    (source as maplibregl.RasterTileSource).setTiles(payload.tiles);
  } else if (!source) {
    map.addSource(sourceId, { type: "raster", tiles: payload.tiles, tileSize: 256 });
    map.addLayer(
      { id: layerId, type: "raster", source: sourceId, paint: { "raster-opacity": 0.42 } },
      map.getLayer("swipe-base-clip-end") ? "swipe-base-clip-end" : undefined,
    );
  }
  if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", "visible");
}

function applyComparisonOpacity(map: maplibregl.Map, mode: string) {
  const baseOpacity = mode === "split" ? 0.5 : mode === "difference" ? 0.08 : 0.62;
  const compareOpacity = mode === "split" ? 0.5 : mode === "difference" ? 0.85 : 0.62;
  for (const id of ["viirs-nightlight-base", "hansen-forest-base"]) {
    if (map.getLayer(id)) map.setPaintProperty(id, "raster-opacity", baseOpacity);
  }
  for (const id of ["viirs-nightlight", "hansen-forest-loss"]) {
    if (map.getLayer(id)) map.setPaintProperty(id, "raster-opacity", compareOpacity);
  }
}

function applyFacilityVisualPriority(map: maplibregl.Map, metric: string, mode: string) {
  if (!map.getLayer("facilities-points")) return;
  map.setPaintProperty("facilities-points", "circle-opacity", metric === "combined" ? 0.72 : mode === "difference" ? 0.28 : metric === "forest" ? 0.4 : 0.32);
}

function createSwipeClipLayer(
  id: string,
  side: "left" | "right" | null,
  positionRef: { current: number },
  modeRef: { current: string },
): maplibregl.CustomLayerInterface {
  return {
    id,
    type: "custom",
    renderingMode: "2d",
    render: (gl) => {
      if (modeRef.current !== "swipe") {
        gl.disable(gl.SCISSOR_TEST);
        return;
      }
      if (!side) {
        gl.disable(gl.SCISSOR_TEST);
        return;
      }
      const width = gl.drawingBufferWidth;
      const height = gl.drawingBufferHeight;
      const divider = Math.round(width * positionRef.current);
      gl.enable(gl.SCISSOR_TEST);
      if (side === "left") gl.scissor(0, 0, divider, height);
      else gl.scissor(divider, 0, width - divider, height);
    },
  };
}

async function waitForBackend() {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch(`${apiBaseUrl}/health`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Backend health HTTP ${response.status}`);
      return;
    } catch (error) {
      if (attempt === 1) throw error;
      await new Promise((resolve) => window.setTimeout(resolve, 1_500));
    } finally {
      window.clearTimeout(timeoutId);
    }
  }
}

async function prepareSatelliteLayers(
  map: maplibregl.Map,
  baseYear: number,
  compareYear: number,
  showTrends: boolean,
  metric: string,
  mode: string,
) {
  await waitForBackend();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      if (mode === "difference" && metric === "nightlight") {
        await updateNightlightDifferenceLayer(map, baseYear, compareYear, showTrends, metric);
        applyComparisonOpacity(map, mode);
        return;
      }
      await Promise.all([
        updateBaseRasterLayer(map, "nightlight", baseYear, showTrends, metric),
        updateBaseRasterLayer(map, "forest", baseYear, showTrends, metric),
        updateNightlightLayer(map, compareYear, showTrends, metric),
        updateForestLayer(map, compareYear, showTrends, metric),
      ]);
      applyComparisonOpacity(map, mode);
      return;
    } catch (error) {
      if (attempt === 1) throw error;
      await new Promise((resolve) => window.setTimeout(resolve, 1_500));
    }
  }
}

export default function MapCanvas() {
  const { showBoundaries, showFacilities, showTrends, baseYear, compareYear, metric, mode, focusFacility } = useAnalysisStore();
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const satelliteInitializedRef = useRef(false);
  const [satelliteStatus, setSatelliteStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const swipePositionRef = useRef(0.5);
  const modeRef = useRef(mode);
  modeRef.current = mode;
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
      const currentMap = map.current!;
      currentMap.addLayer(createSwipeClipLayer("swipe-base-clip-start", "left", swipePositionRef, modeRef));
      currentMap.addLayer(createSwipeClipLayer("swipe-base-clip-end", null, swipePositionRef, modeRef));
      currentMap.addLayer(createSwipeClipLayer("swipe-compare-clip-start", "right", swipePositionRef, modeRef));
      currentMap.addLayer(createSwipeClipLayer("swipe-compare-clip-end", null, swipePositionRef, modeRef));

      void fetch(`${apiBaseUrl}/api/v1/admin-boundaries`)
        .then((response) => response.ok ? response.json() : ({ type: "FeatureCollection", features: [] }))
        .then((boundaries) => {
          if (!map.current || currentMap.getSource("admin-boundaries")) return;
          currentMap.addSource("admin-boundaries", { type: "geojson", data: boundaries });
          currentMap.addLayer({ id: "admin-boundaries-fill", type: "fill", source: "admin-boundaries", paint: { "fill-color": "#2dd4bf", "fill-opacity": 0.08 } });
          currentMap.addLayer({ id: "admin-boundaries-line", type: "line", source: "admin-boundaries", paint: { "line-color": "#0f766e", "line-width": 1.2 } });
        })
        .catch(() => undefined);

      void fetch("/data/facilities-map.geojson")
        .then((response) => response.ok ? response.json() : ({ type: "FeatureCollection", features: [] }))
        .then((facilities) => {
        if (!map.current) return;
        if (currentMap.getSource("facilities")) return;
        const currentState = useAnalysisStore.getState();
        currentMap.addSource("facilities", { type: "geojson", data: facilities });
        currentMap.addLayer({ id: "facilities-points", type: "circle", source: "facilities", paint: { "circle-color": "#2563eb", "circle-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.35, 8, 0.5, 11, 0.8], "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 2, 8, 3, 11, 5], "circle-stroke-color": "#ffffff", "circle-stroke-width": 1 } });
        currentMap.addLayer({ id: "facilities-selected-halo", type: "circle", source: "facilities", filter: ["==", ["get", "id"], -1], paint: { "circle-color": "#60a5fa", "circle-opacity": 0.3, "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 11, 8, 15, 11, 20], "circle-blur": 0.45, "circle-stroke-color": "#bfdbfe", "circle-stroke-width": 2 } });
        currentMap.addLayer({ id: "facilities-selected", type: "circle", source: "facilities", filter: ["==", ["get", "id"], -1], paint: { "circle-color": "#ffffff", "circle-opacity": 0.95, "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 5, 8, 7, 11, 10], "circle-stroke-color": "#dc2626", "circle-stroke-width": 2.5 } });
        currentMap.setLayoutProperty("facilities-points", "visibility", currentState.showFacilities ? "visible" : "none");
        currentMap.setLayoutProperty("facilities-selected-halo", "visibility", currentState.focusFacility ? "visible" : "none");
        currentMap.setLayoutProperty("facilities-selected", "visibility", currentState.focusFacility ? "visible" : "none");
        currentMap.setFilter("facilities-selected-halo", ["==", ["get", "id"], currentState.focusFacility?.id ?? -1]);
        currentMap.setFilter("facilities-selected", ["==", ["get", "id"], currentState.focusFacility?.id ?? -1]);
        applyFacilityVisualPriority(currentMap, currentState.metric, currentState.mode);
        currentMap.on("mouseenter", "facilities-points", () => { currentMap.getCanvas().style.cursor = "pointer"; });
        currentMap.on("mouseleave", "facilities-points", () => { currentMap.getCanvas().style.cursor = ""; });
        currentMap.on("click", "facilities-points", async (event) => {
          const feature = event.features?.[0];
          const facilityId = feature?.properties?.id;
          if (!facilityId) return;
          const popup = new maplibregl.Popup({ maxWidth: "340px" }).setLngLat(event.lngLat).setHTML("<strong>시설 정보를 불러오는 중...</strong>").addTo(currentMap);
          try {
            const response = await fetch(`${apiBaseUrl}/api/v1/facilities/${facilityId}`);
            if (!response.ok) throw new Error("facility request failed");
            const detail = await response.json() as { facility: { name: string; category: string; address: string }; attributes: Array<{ attribute_name: string; attribute_value: string }>; trends: Array<{ title: string; trend_date: string; source_url: string; content_text: string }> };
            const seriesResponse = await fetch(`${apiBaseUrl}/api/v1/facilities/${facilityId}/timeseries?start_year=2012&end_year=2025`);
            const series = seriesResponse.ok ? (await seriesResponse.json() as { series: Array<{ year: number; nightlight?: number; forestLossKm2?: number }> }).series : [];
            const attributes = detail.attributes.slice(0, 8).map((item) => `<li>${escapeHtml(item.attribute_name)}: ${escapeHtml(item.attribute_value)}</li>`).join("");
            const trends = detail.trends.slice(0, 5).map((item) => `<li>${escapeHtml(item.trend_date)} · ${escapeHtml(item.title)}</li>`).join("");
            const timeline = series.slice(-5).map((item) => `<li>${item.year}: 조도 ${item.nightlight == null ? "-" : item.nightlight.toFixed(2)} · 산림손실 ${item.forestLossKm2 == null ? "-" : item.forestLossKm2.toFixed(3)} km²</li>`).join("");
            popup.setHTML(`<div class="facility-popup"><strong>${escapeHtml(detail.facility.name)}</strong><div>${escapeHtml(detail.facility.category)}</div><div>${escapeHtml(detail.facility.address)}</div>${attributes ? `<h4>속성</h4><ul>${attributes}</ul>` : ""}${trends ? `<h4>관련 동향</h4><ul>${trends}</ul>` : ""}${timeline ? `<h4>최근 시계열</h4><ul>${timeline}</ul>` : ""}</div>`);
          } catch {
            popup.setHTML("<strong>시설 정보를 불러오지 못했습니다.</strong>");
          }
        });
      }).catch(() => undefined);

      satelliteInitializedRef.current = true;
      void prepareSatelliteLayers(currentMap, baseYear, compareYear, showTrends, metric, mode)
        .then(() => setSatelliteStatus("ready"))
        .catch(() => setSatelliteStatus("unavailable"));
    });
    return () => { map.current?.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    if (!map.current?.isStyleLoaded() || !satelliteInitializedRef.current) return;
    if (mode === "difference" && metric === "nightlight") {
      if (map.current.getLayer("viirs-nightlight-base")) map.current.setLayoutProperty("viirs-nightlight-base", "visibility", "none");
      if (map.current.getLayer("viirs-nightlight")) map.current.setLayoutProperty("viirs-nightlight", "visibility", "none");
      void updateNightlightDifferenceLayer(map.current, baseYear, compareYear, showTrends, metric).catch(() => undefined);
      return;
    }
    if (map.current.getLayer("viirs-nightlight-difference")) map.current.setLayoutProperty("viirs-nightlight-difference", "visibility", "none");
    void updateNightlightLayer(map.current, compareYear, showTrends, metric).catch(() => undefined);
    void updateForestLayer(map.current, compareYear, showTrends, metric).catch(() => undefined);
    void updateBaseRasterLayer(map.current, "nightlight", baseYear, showTrends, metric).catch(() => undefined);
    void updateBaseRasterLayer(map.current, "forest", baseYear, showTrends, metric).catch(() => undefined);
    applyComparisonOpacity(map.current, mode);
  }, [baseYear, compareYear, showTrends, metric, mode]);
  useEffect(() => {
    if (!map.current || !focusFacility) return;
    map.current.flyTo({ center: [focusFacility.longitude, focusFacility.latitude], zoom: 12, duration: 800 });
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
      applyFacilityVisualPriority(currentMap, metric, mode);
    }
    if (currentMap.getLayer("facilities-selected")) {
      currentMap.setLayoutProperty("facilities-selected", "visibility", focusFacility ? "visible" : "none");
      currentMap.setFilter("facilities-selected", ["==", ["get", "id"], focusFacility?.id ?? -1]);
    }
    if (currentMap.getLayer("facilities-selected-halo")) {
      currentMap.setLayoutProperty("facilities-selected-halo", "visibility", focusFacility ? "visible" : "none");
      currentMap.setFilter("facilities-selected-halo", ["==", ["get", "id"], focusFacility?.id ?? -1]);
    }
  }, [showBoundaries, showFacilities, focusFacility, metric, mode]);
  return <>
    <div className="map" ref={container} aria-label="평양 위성정보 비교 지도" />
    {satelliteStatus !== "ready" && (
      <div className={`satellite-status satellite-status-${satelliteStatus}`} role="status">
        {satelliteStatus === "loading"
          ? "위성 분석 레이어를 준비하고 있습니다..."
          : "위성 분석 레이어를 불러오지 못했습니다. 잠시 후 다시 시도해주세요."}
      </div>
    )}
    <SwipeControl enabled={mode === "swipe"} baseYear={baseYear} compareYear={compareYear} positionRef={swipePositionRef} onPositionChange={() => map.current?.triggerRepaint()} />
  </>;
}
