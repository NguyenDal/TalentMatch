import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import axios from "axios";
import App from "./App";

jest.mock("react-router-dom", () => {
  // CRA's older Jest doesn't resolve package exports. React Router's CommonJS
  // entry provides the same public routing components, without mocking them.
  global.TextEncoder = require("util").TextEncoder;
  return jest.requireActual("react-router");
}, { virtual: true });
jest.mock("axios", () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock("./AuthContext", () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => ({ user: null, login: jest.fn(), setAuthData: jest.fn() }),
}));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  axios.get.mockResolvedValue({ data: { enabled: true } });
  jest.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test("public login routes to username-only signup and back, with Google available on both", async () => {
  window.history.replaceState({}, "", "/login");
  render(<App />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading your page");
  expect(await screen.findByRole("heading", { name: "Welcome back." })).toBeVisible();
  await waitFor(() => expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled());
  expect(screen.getByLabelText("Username or email")).toBeVisible();
  fireEvent.click(screen.getByRole("link", { name: "Create an account" }));
  expect(await screen.findByRole("heading", { name: "Create your account." })).toBeVisible();
  expect(window.location.pathname).toBe("/signup");
  expect(screen.getByLabelText("Username")).toBeVisible();
  expect(screen.getByLabelText("Email address")).toBeVisible();
  expect(screen.getByLabelText("Password")).toBeVisible();
  expect(screen.queryByLabelText(/first name|last name/i)).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled());
  fireEvent.click(screen.getAllByRole("link", { name: "Log in" }).at(-1));
  expect(await screen.findByRole("heading", { name: "Welcome back." })).toBeVisible();
  expect(window.location.pathname).toBe("/login");
});

test("a direct contact visit loads its route while keeping public navigation available", async () => {
  window.history.replaceState({}, "", "/contact");
  render(<App />);
  expect(screen.getByRole("link", { name: "TalentMatch home" })).toBeVisible();
  expect(await screen.findByRole("heading", { name: /The person behind the match/ })).toBeVisible();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(window.location.pathname).toBe("/contact");
});
