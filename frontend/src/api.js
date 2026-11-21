// Production serves React and FastAPI together. Keep an absolute base so auth
// origin checks and URL parsing work, while local development uses port 8000.
export function resolveApiBaseUrl(configured, environment, origin) {
  return (configured?.trim() || (environment === "production" ? origin : "http://localhost:8000")).replace(/\/+$/, "");
}

export const BASE_URL = resolveApiBaseUrl(process.env.REACT_APP_API_URL, process.env.NODE_ENV, window.location.origin);

// Function to generate authorization headers for API requests.
// Match AuthContext's session-first storage order, including Google sign-ins.
export function getAuthHeaders() {
  const token = sessionStorage.getItem("token") || localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {}; // Return headers with the token if it exists.
}
