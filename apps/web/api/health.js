export default function handler(req, res) {
  res.status(200).json({
    status: "ok",
    service: "평양 위성정보 분석 PoC",
    environment: process.env.VERCEL_ENV || "unknown",
    deployment: {
      provider: "Vercel",
      commit_sha: process.env.VERCEL_GIT_COMMIT_SHA || null,
    },
    timestamp: new Date().toISOString(),
  });
}
