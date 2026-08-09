export default function handler(req, res) {
  res.status(200).json({
    service: "평양 위성정보 분석 PoC",
    status: "running",
    description: "북한 지역 위성정보 기반 야간조도·산림 변화 분석 서비스",
    features: [
      "VIIRS 야간조도 변화 분석",
      "Hansen 산림 변화 분석",
      "연도별 위성정보 비교",
      "북한 시설정보 연계",
      "근거 기반 분석 결과 제공",
    ],
    main_url: "https://pyongyang-satellite-poc.vercel.app/",
  });
}
