import { getAuthHeaders, resolveApiBaseUrl } from "./api";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

test("production uses the deployment origin and development uses the local API", () => {
  expect(resolveApiBaseUrl(undefined, "production", "https://talentmatch.onrender.com")).toBe("https://talentmatch.onrender.com");
  expect(resolveApiBaseUrl("", "development", "http://localhost:3000")).toBe("http://localhost:8000");
  expect(resolveApiBaseUrl("  https://api.example.com/// ", "production", "https://app.example.com")).toBe("https://api.example.com");
});

test("protected requests use session auth first and remembered auth as a fallback", () => {
  expect(getAuthHeaders()).toEqual({});
  localStorage.setItem("token", "remembered-session");
  expect(getAuthHeaders()).toEqual({ Authorization: "Bearer remembered-session" });
  sessionStorage.setItem("token", "current-session");
  expect(getAuthHeaders()).toEqual({ Authorization: "Bearer current-session" });
});
