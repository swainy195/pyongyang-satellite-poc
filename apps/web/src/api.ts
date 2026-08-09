const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const fallbackApiBaseUrl = import.meta.env.PROD
  ? "https://pyongyang-satellite-poc.onrender.com"
  : "http://localhost:8001";
const selectedApiBaseUrl = configuredApiBaseUrl && !(import.meta.env.PROD && configuredApiBaseUrl.includes("localhost"))
  ? configuredApiBaseUrl
  : fallbackApiBaseUrl;

// Accept both a host URL and an accidentally suffixed /api/v1 URL.
export const apiBaseUrl = selectedApiBaseUrl.replace(/\/+$/, "").replace(/\/api\/v1$/, "");
