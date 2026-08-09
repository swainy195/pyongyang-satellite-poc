export default function handler(req, res) {
  res.status(200).json({
    service: {
      name: "평양 위성정보 분석 PoC",
      status: "running",
      description: "북한 지역 위성정보 기반 야간조도·산림 변화 분석 서비스",
      main_url: "https://pyongyang-satellite-poc.vercel.app/",
    },
    architecture: {
      frontend: "React + Vite",
      hosting: "Vercel",
      database: "Supabase",
      satellite_platform: "Google Earth Engine",
    },
    datasets: [
      { name: "VIIRS Nighttime Lights", purpose: "야간조도 변화 분석" },
      { name: "Hansen Global Forest Change", purpose: "산림 변화 분석" },
    ],
    features: [
      "VIIRS 야간조도 변화 분석",
      "Hansen 산림 변화 분석",
      "연도별 위성정보 비교",
      "북한 시설정보 연계",
      "근거 기반 분석 결과 제공",
    ],
    ai_access: {
      robots: "/robots.txt",
      llms: "/llms.txt",
      readable_page: "/ai-test.html",
      context_api: "/api/ai-context",
      health_api: "/api/health",
      features_api: "/api/features",
      data_sources_api: "/api/data-sources",
    },
    deployment: {
      provider: "Vercel",
      commit_sha: process.env.VERCEL_GIT_COMMIT_SHA || null,
    },
  });
}
