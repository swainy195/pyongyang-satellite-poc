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
  setMetric: (metric: Metric) => void;
  setMode: (mode: CompareMode) => void;
  setYears: (baseYear: number, compareYear: number) => void;
  setLayerVisible: (layer: "boundaries" | "facilities" | "trends", visible: boolean) => void;
  setFocusFacility: (facility: AnalysisState["focusFacility"]) => void;
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
  setMetric: (metric) => set((state) => ({ metric, selectedMetric: state.focusFacility ? metric : null })),
  setMode: (mode) => set({ mode }),
  setYears: (baseYear, compareYear) => set({ baseYear, compareYear }),
  setLayerVisible: (layer, visible) => {
    const key = layer === "boundaries" ? "showBoundaries" : layer === "facilities" ? "showFacilities" : "showTrends";
    set({ [key]: visible });
  },
  setFocusFacility: (facility) => set(facility
    ? { focusFacility: facility, metric: "nightlight", selectedMetric: "nightlight", mode: "difference" }
    : { focusFacility: null, selectedMetric: null }),
}));
