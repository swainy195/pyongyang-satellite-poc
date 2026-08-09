const backendUrl = (process.env.BACKEND_URL || "https://pyongyang-satellite-poc.onrender.com").replace(/\/$/, "");

export default async function handler(req, res) {
  const query = new URL(req.url, "http://localhost").search;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${backendUrl}/api/v1/facilities${query}`, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    const body = await response.text();
    res.status(response.status).setHeader("Content-Type", "application/json").send(body);
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Facility service unavailable" });
  } finally {
    clearTimeout(timeout);
  }
}
