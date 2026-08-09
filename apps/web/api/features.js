export default function handler(req, res) {
  res.status(200).json({
    service: "평양 위성정보 분석 PoC",
    features: [
      { id: "nighttime-light", name: "야간조도 변화 분석", dataset: "VIIRS Nighttime Lights", description: "연도별 야간조도 변화를 비교합니다." },
      { id: "forest-change", name: "산림 변화 분석", dataset: "Hansen Global Forest Change", description: "시설 주변 산림손실 변화를 분석합니다." },
      { id: "year-comparison", name: "연도별 위성정보 비교", description: "서로 다른 연도의 위성 데이터를 비교합니다." },
      { id: "facility", name: "북한 시설정보 연계", description: "시설 위치와 속성 및 관련 동향을 연결합니다." },
      { id: "evidence-analysis", name: "근거 기반 분석", description: "관찰·해석·출처를 구분해 분석 결과를 제공합니다." },
    ],
  });
}
