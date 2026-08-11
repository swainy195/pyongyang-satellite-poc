import { create } from "zustand";
export type Metric = "nightlight" | "forest" | "combined";
export type CompareMode = "swipe" | "split" | "difference" | "timeline";
interface AnalysisState {
  metric: Metric;
  selectedMetric: Metric | null;
  mode: CompareMode;
  baseYear: number;
  compareYear: number;
  showBoundaries: boolean;
  showFacilities: boolean;
  showTrends: boolean;
  focusFacility: { id: number; name: string; category?: string; address?: string; longitude: number; latitude: number } | null;
  analysisPanelOpen: boolean;
  setMetric: (metric: Metric) => void;
  setMode: (mode: CompareMode) => void;
  setYears: (baseYear: number, compareYear: number) => void;
  setLayerVisible: (layer: "boundaries" | "facilities" | "trends", visible: boolean) => void;
  setFocusFacility: (facility: AnalysisState["focusFacility"]) => void;
  setAnalysisPanelOpen: (open: boolean) => void;
  selectMetric: (metric: Metric) => void;
}
export const useAnalysisStore = create<AnalysisState>((set) => ({
  metric: "nightlight",
  selectedMetric: null,
  mode: "difference",
  baseYear: 2014,
  compareYear: 2025,
  showBoundaries: true,
  showFacilities: false,
  showTrends: true,
  focusFacility: null,
  analysisPanelOpen: false,
  setMetric: (metric) => set((state) => ({ metric, selectedMetric: state.focusFacility ? metric : null })),
  selectMetric: (metric) => set((state) => state.focusFacility
    ? { metric, selectedMetric: metric, mode: "difference", analysisPanelOpen: metric === "combined" ? true : state.analysisPanelOpen }
    : { metric, selectedMetric: null }),
  setMode: (mode) => set({ mode }),
  setYears: (baseYear, compareYear) => set({ baseYear, compareYear }),
  setLayerVisible: (layer, visible) => {
    const key = layer === "boundaries" ? "showBoundaries" : layer === "facilities" ? "showFacilities" : "showTrends";
    set({ [key]: visible });
  },
  setFocusFacility: (facility) => set(facility
    ? { focusFacility: facility, selectedMetric: null, analysisPanelOpen: true }
    : { focusFacility: null, selectedMetric: null, metric: "nightlight", mode: "difference", analysisPanelOpen: false }),
  setAnalysisPanelOpen: (open) => set({ analysisPanelOpen: open }),
}));
