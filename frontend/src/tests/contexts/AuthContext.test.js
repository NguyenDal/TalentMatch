import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import axios from "axios";
import { AuthProvider, useAuth } from "../../contexts/AuthContext";
import { BASE_URL } from "../../services/api";

jest.mock("axios", () => ({
  post: jest.fn(),
  defaults: { headers: { common: {} } },
  interceptors: { response: { use: jest.fn(), eject: jest.fn() } },
}));

const token = `header.${btoa(JSON.stringify({ exp: 4102444800 }))}.signature`;
function Harness() {
  const { user, setAuthData } = useAuth();
  return <>
    <p>{user ? user.username : "Signed out"}</p>
    <button onClick={() => setAuthData({ token, email: "user@gmail.com", username: "chosen_user" }, false)}>Session sign in</button>
    <button onClick={() => setAuthData({ token, email: "user@gmail.com", username: "chosen_user" }, true)}>Remember sign in</button>
  </>;
}

beforeEach(() => { jest.clearAllMocks(); localStorage.clear(); sessionStorage.clear(); });

test("sign-in storage respects remember and clears the other storage", () => {
  render(<AuthProvider><Harness /></AuthProvider>);
  fireEvent.click(screen.getByText("Remember sign in"));
  expect(localStorage.getItem("token")).toBe(token);
  expect(sessionStorage.getItem("token")).toBeNull();
  fireEvent.click(screen.getByText("Session sign in"));
  expect(sessionStorage.getItem("token")).toBe(token);
  expect(localStorage.getItem("token")).toBeNull();
});

test.each(["/login/", "/auth/google/link/", "/auth/google/signup/"])("a 401 from %s stays with the form without clearing a session", async (path) => {
  render(<AuthProvider><Harness /></AuthProvider>);
  fireEvent.click(screen.getByText("Session sign in"));
  const rejectResponse = axios.interceptors.response.use.mock.calls[0][1];
  const error = { response: { status: 401 }, config: { url: `${BASE_URL}${path}` } };
  await act(async () => { await expect(rejectResponse(error)).rejects.toEqual(error); });
  expect(sessionStorage.getItem("token")).toBe(token);
  expect(screen.getByText("chosen_user")).toBeVisible();
});
