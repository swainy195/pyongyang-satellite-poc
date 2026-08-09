export default function handler(req, res) {
  res.status(200).json({
    service: "평양 위성정보 분석 PoC",
    data_sources: [
      { id: "viirs", name: "VIIRS Nighttime Lights", category: "satellite", provider: "Google Earth Engine data catalog", purpose: "야간조도 변화 분석" },
      { id: "hansen", name: "Hansen Global Forest Change", category: "satellite", provider: "Google Earth Engine data catalog", purpose: "산림 변화 분석" },
      { id: "facility", name: "북한 시설정보", category: "structured-data", storage: "Supabase", purpose: "위성 분석 결과와 시설 정보 연결" },
      { id: "trends", name: "북한 관련 동향", category: "structured-data", storage: "Supabase", purpose: "시설 관련 동향 연결" },
    ],
  });
}
