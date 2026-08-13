import { useEffect, useRef, useState, type PointerEvent } from "react";
import maplibregl from "maplibre-gl";
import { useAnalysisStore } from "../store";
import { apiBaseUrl } from "../api";

class SatelliteRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "SatelliteRequestError";
    this.status = status;
  }
}


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
  if (!response.ok) throw new SatelliteRequestError(`VIIRS tile metadata HTTP ${response.status}`, response.status);
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
  if (!response.ok) throw new SatelliteRequestError(`VIIRS difference tile metadata HTTP ${response.status}`, response.status);
  const payload = await response.json() as { tiles: string[] };
  const sourceId = "viirs-nightlight-difference-source";
  const source = map.getSource(sourceId);
  if (source && "setTiles" in source) {
    (source as maplibregl.RasterTileSource).setTiles(payload.tiles);
  } else if (!source) {
    map.addSource(sourceId, { type: "raster", tiles: payload.tiles, tileSize: 256 });
    const beforeId = map.getLayer("admin-boundaries-fill") ? "admin-boundaries-fill" : map.getLayer("facilities-points") ? "facilities-points" : undefined;
    map.addLayer({ id: layerId, type: "raster", source: sourceId, paint: { "raster-opacity": 0.62 } }, beforeId);
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
  if (!response.ok) throw new SatelliteRequestError(`Hansen tile metadata HTTP ${response.status}`, response.status);
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

async function updateForestPeriodLayer(
  map: maplibregl.Map,
  startYear: number,
  endYear: number,
  visible: boolean,
  metric: string,
) {
  const layerId = "hansen-forest-loss";
  const shouldShow = visible && metric === "forest" && startYear <= endYear && endYear <= 2025;
  if (!shouldShow) {
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", "none");
    return;
  }

  const response = await fetch(`${apiBaseUrl}/api/v1/map/tiles/forest/period?start_year=${startYear}&end_year=${endYear}`);
  if (!response.ok) throw new SatelliteRequestError(`Hansen period tile metadata HTTP ${response.status}`, response.status);
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
  if (!response.ok) throw new SatelliteRequestError(`${type} tile metadata HTTP ${response.status}`, response.status);
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

function applyComparisonOpacity(map: maplibregl.Map, mode: string, metric = "", hasFocusedFacility = false) {
  const baseOpacity = mode === "split" ? 0.5 : mode === "difference" ? 0.08 : 0.62;
  const compareOpacity = mode === "split" ? 0.5 : mode === "difference" && metric === "forest" ? 0.58 : mode === "difference" ? 0.85 : 0.62;
  for (const id of ["viirs-nightlight-base", "hansen-forest-base"]) {
    if (map.getLayer(id)) map.setPaintProperty(id, "raster-opacity", baseOpacity);
  }
  for (const id of ["viirs-nightlight", "hansen-forest-loss"]) {
    if (map.getLayer(id)) map.setPaintProperty(id, "raster-opacity", compareOpacity);
  }
  if (map.getLayer("viirs-nightlight-difference")) {
    map.setPaintProperty("viirs-nightlight-difference", "raster-opacity", hasFocusedFacility ? 0.52 : 0.62);
  }
}

function applyFacilityVisualPriority(map: maplibregl.Map, metric: string, mode: string) {
  if (!map.getLayer("facilities-points")) return;
  map.setPaintProperty("facilities-points", "circle-opacity", metric === "combined" ? 0.72 : mode === "difference" ? 0.28 : metric === "forest" ? 0.4 : 0.32);
}

function hideSatelliteLayers(map: maplibregl.Map) {
  for (const layerId of [
    "viirs-nightlight-difference",
    "viirs-nightlight",
    "viirs-nightlight-base",
    "hansen-forest-loss",
    "hansen-forest-base",
  ]) {
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", "none");
  }
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
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(`${apiBaseUrl}/health`, { signal: controller.signal });
    if (!response.ok) throw new SatelliteRequestError(`Backend health HTTP ${response.status}`, response.status);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function prepareSatelliteLayers(
  map: maplibregl.Map,
  baseYear: number,
  compareYear: number,
  showTrends: boolean,
  metric: string,
  mode: string,
  hasFocusedFacility: boolean,
) {
  if (!hasFocusedFacility) return;
  await waitForBackend();
  if (mode === "difference" && metric === "nightlight") {
    await updateNightlightDifferenceLayer(map, baseYear, compareYear, showTrends, metric);
    applyComparisonOpacity(map, mode, metric);
    return;
  }
  if (mode === "difference" && metric === "forest") {
    await updateForestPeriodLayer(map, baseYear, compareYear, showTrends, metric);
    applyComparisonOpacity(map, mode, metric);
    return;
  }
  await Promise.all([
    updateBaseRasterLayer(map, "nightlight", baseYear, showTrends, metric),
    updateBaseRasterLayer(map, "forest", baseYear, showTrends, metric),
    updateNightlightLayer(map, compareYear, showTrends, metric),
    updateForestLayer(map, compareYear, showTrends, metric),
  ]);
  applyComparisonOpacity(map, mode, metric);
}

function isRetryableSatelliteError(error: unknown) {
  if (error instanceof SatelliteRequestError) return error.status >= 500 && error.status <= 599;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  return true;
}

async function retrySatelliteLoad(
  task: () => Promise<void>,
  onRetry: (attempt: number, total: number) => void,
) {
  const totalAttempts = 3;
  const delays = [1_500, 3_000];
  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    try {
      await task();
      return;
    } catch (error) {
      if (!isRetryableSatelliteError(error) || attempt === totalAttempts) throw error;
      onRetry(attempt + 1, totalAttempts);
      await new Promise((resolve) => window.setTimeout(resolve, delays[attempt - 1]));
    }
  }
}

export default function MapCanvas() {
  const { showBoundaries, showFacilities, showTrends, baseYear, compareYear, metric, mode, focusFacility, selectedMetric } = useAnalysisStore();
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const satelliteInitializedRef = useRef(false);
  const satelliteRequestRef = useRef(0);
  const [satelliteStatus, setSatelliteStatus] = useState<"idle" | "loading" | "retrying" | "ready" | "unavailable">("idle");
  const [satelliteRetryAttempt, setSatelliteRetryAttempt] = useState(0);
  const [swipePosition, setSwipePosition] = useState(0.5);
  const [showSwipeHint, setShowSwipeHint] = useState(false);
  const swipePositionRef = useRef(swipePosition);
  swipePositionRef.current = swipePosition;
  const swipeDraggingRef = useRef(false);
  const modeRef = useRef<string>(mode);
  modeRef.current = selectedMetric === "combined" ? "" : mode;
  const updateSwipePosition = (clientX: number) => {
    const mapContainer = container.current;
    if (!mapContainer) return;
    const rect = mapContainer.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    swipePositionRef.current = ratio;
    setSwipePosition(ratio);
    map.current?.triggerRepaint();
  };
  const handleSwipePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setShowSwipeHint(false);
    swipeDraggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.dataset.dragging = "true";
    map.current?.dragPan.disable();
    updateSwipePosition(event.clientX);
  };
  const handleSwipePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!swipeDraggingRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    updateSwipePosition(event.clientX);
  };
  const handleSwipePointerEnd = (event: PointerEvent<HTMLButtonElement>) => {
    if (!swipeDraggingRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    swipeDraggingRef.current = false;
    event.currentTarget.dataset.dragging = "false";
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    map.current?.dragPan.enable();
  };
  const startSatelliteLoad = (currentMap: maplibregl.Map) => {
    const currentState = useAnalysisStore.getState();
    if (!currentState.focusFacility || !currentState.selectedMetric || currentState.selectedMetric === "combined") {
      satelliteRequestRef.current += 1;
      hideSatelliteLayers(currentMap);
      setSatelliteStatus("idle");
      return;
    }
    const requestId = ++satelliteRequestRef.current;
    setSatelliteStatus("loading");
    setSatelliteRetryAttempt(0);
    hideSatelliteLayers(currentMap);
    void retrySatelliteLoad(
      () => {
        const latestState = useAnalysisStore.getState();
        if (requestId !== satelliteRequestRef.current || latestState.selectedMetric === "combined") {
          hideSatelliteLayers(currentMap);
          return Promise.resolve();
        }
        return prepareSatelliteLayers(currentMap, latestState.baseYear, latestState.compareYear, latestState.showTrends, latestState.metric, latestState.mode, true);
      },
      (attempt, total) => {
        if (requestId !== satelliteRequestRef.current) return;
        setSatelliteRetryAttempt(attempt);
        setSatelliteStatus("retrying");
      },
    )
      .then(() => {
        const latestState = useAnalysisStore.getState();
        if (requestId !== satelliteRequestRef.current || !latestState.focusFacility || !latestState.selectedMetric || latestState.selectedMetric === "combined") {
          hideSatelliteLayers(currentMap);
          setSatelliteStatus("idle");
          return;
        }
        setSatelliteStatus("ready");
      })
      .catch(() => {
        if (requestId === satelliteRequestRef.current && useAnalysisStore.getState().focusFacility) setSatelliteStatus("unavailable");
      });
  };
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
        const hoverPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10, className: "facility-hover-popup" });
        currentMap.on("mouseenter", "facilities-points", (event) => {
          currentMap.getCanvas().style.cursor = "pointer";
          const feature = event.features?.[0];
          if (!feature) return;
          const properties = feature.properties as Record<string, unknown> | undefined;
          const name = properties?.name ?? properties?.facility_name ?? "시설";
          const category = properties?.category;
          hoverPopup
            .setLngLat(event.lngLat)
            .setHTML(`<div class="facility-hover-tooltip"><strong>${escapeHtml(name)}</strong>${category ? `<span>${escapeHtml(category)}</span>` : ""}</div>`)
            .addTo(currentMap);
        });
        currentMap.on("mouseleave", "facilities-points", () => {
          currentMap.getCanvas().style.cursor = "";
          hoverPopup.remove();
        });
        currentMap.on("click", "facilities-points", async (event) => {
          const feature = event.features?.[0];
          const facilityId = feature?.properties?.id;
          if (!facilityId) return;
          const popup = new maplibregl.Popup({ maxWidth: "340px" }).setLngLat(event.lngLat).setHTML("<strong>시설 정보를 불러오는 중...</strong>").addTo(currentMap);
          try {
            const response = await fetch(`${apiBaseUrl}/api/v1/facilities/${facilityId}`);
            if (!response.ok) throw new Error("facility request failed");
            const detail = await response.json() as { facility: { name: string; category: string; address: string }; attributes: Array<{ attribute_name: string; attribute_value: string }>; trends: Array<{ title: string; trend_date: string; source_url: string; content_text: string }> };
            const currentState = useAnalysisStore.getState();
            const seriesResponse = await fetch(`${apiBaseUrl}/api/v1/facilities/${facilityId}/timeseries?start_year=${currentState.baseYear}&end_year=${currentState.compareYear}`);
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
      const initialState = useAnalysisStore.getState();
      if (initialState.focusFacility && initialState.selectedMetric) {
        startSatelliteLoad(currentMap);
      }
    });
    return () => { map.current?.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    if (!map.current?.isStyleLoaded() || !satelliteInitializedRef.current) return;
    const currentMap = map.current;
    if (!focusFacility || !selectedMetric) {
      hideSatelliteLayers(currentMap);
      setSatelliteStatus("idle");
      return;
    }
    startSatelliteLoad(currentMap);
  }, [baseYear, compareYear, showTrends, metric, mode, focusFacility, selectedMetric]);
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
  useEffect(() => {
    if (!map.current) return;
    applyComparisonOpacity(map.current, mode, metric, Boolean(focusFacility));
  }, [focusFacility, metric, mode]);
  useEffect(() => {
    if (mode !== "swipe") return;
    swipePositionRef.current = 0.5;
    setSwipePosition(0.5);
    map.current?.triggerRepaint();
  }, [mode]);
  useEffect(() => {
    if (mode !== "swipe") {
      setShowSwipeHint(false);
      return;
    }
    setShowSwipeHint(true);
    const timeoutId = window.setTimeout(() => setShowSwipeHint(false), 2500);
    return () => window.clearTimeout(timeoutId);
  }, [mode]);
  return <>
    <div className="map" ref={container} aria-label="평양 위성정보 비교 지도" />
    {focusFacility && selectedMetric && selectedMetric !== "combined" && satelliteStatus !== "ready" && (
      <div className={`satellite-status satellite-status-${satelliteStatus}`} role="status">
        {satelliteStatus === "loading"
          ? "위성 레이어 준비 중..."
          : satelliteStatus === "retrying"
            ? `위성 레이어를 다시 불러오는 중... (${satelliteRetryAttempt}/3)`
            : "위성 레이어를 불러오지 못했습니다."}
        {satelliteStatus === "unavailable" && <button type="button" onClick={() => { if (map.current) startSatelliteLoad(map.current); }}>다시 시도</button>}
      </div>
    )}
    {selectedMetric !== "combined" && <div className={`swipe-control${mode === "swipe" ? " is-enabled" : ""}`} aria-hidden={mode !== "swipe"}>
      <div className="swipe-label swipe-label-base"><span className="swipe-year-text">{baseYear}년 · 과거</span></div>
      <div className="swipe-label swipe-label-compare"><span className="swipe-year-text">{compareYear}년 · 비교</span></div>
      <div className="swipe-rail" style={{ left: `${swipePosition * 100}%` }} />
      {mode === "swipe" && showSwipeHint && <span className="swipe-hint">좌우로 끌어 비교</span>}
      <button
        type="button"
        className="swipe-handle"
        style={{ left: `${swipePosition * 100}%` }}
        aria-label={`${baseYear}년 기준과 ${compareYear}년 비교 위치 조절`}
        title="좌우로 드래그하여 비교 위치 조절"
        onPointerDown={handleSwipePointerDown}
        onPointerMove={handleSwipePointerMove}
        onPointerUp={handleSwipePointerEnd}
        onPointerCancel={handleSwipePointerEnd}
        onLostPointerCapture={handleSwipePointerEnd}
      >
        <span aria-hidden="true">◀ ● ▶</span>
      </button>
    </div>}
  </>;
}
