// Set the API origin at build time for a deployed frontend. Callers add their
// own leading slash, so normalize a trailing slash here once.
export const BASE_URL = (process.env.REACT_APP_API_URL || "http://localhost:8000").replace(/\/+$/, "");

// Function to generate authorization headers for API requests.
// It retrieves the JWT token from localStorage and includes it in the headers if available.
export function getAuthHeaders() {
  const token = localStorage.getItem("token"); // Retrieve the token from localStorage.
  return token ? { Authorization: `Bearer ${token}` } : {}; // Return headers with the token if it exists.
}
