import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axios from "axios";
import App from "../../app/App";

let mockUser = null;

jest.mock("react-router-dom", () => {
  // CRA's older Jest doesn't resolve package exports. React Router's CommonJS
  // entry provides the same public routing components, without mocking them.
  global.TextEncoder = require("util").TextEncoder;
  return jest.requireActual("react-router");
}, { virtual: true });
jest.mock("axios", () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock("../../contexts/AuthContext", () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => ({ user: mockUser, login: jest.fn(), setAuthData: jest.fn(), logout: jest.fn() }),
}));

beforeEach(() => {
  mockUser = null;
  localStorage.clear();
  sessionStorage.clear();
  axios.get.mockImplementation(url => Promise.resolve({ data: url.endsWith("/applied-jobs/") ? { jobs: [] } : { enabled: true } }));
  axios.post.mockResolvedValue({ data: { jobs: [], unavailable_boards: [], stale_boards: [] } });
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
  // A cold test run also transforms the lazy route module before it can render.
  expect(await screen.findByRole("heading", { name: /The person behind the match/ }, { timeout: 5000 })).toBeVisible();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(window.location.pathname).toBe("/contact");
});

test.each([false, true])("both policies open directly and from the shared footer (signed in: %s)", async signedIn => {
  mockUser = signedIn ? { username: "Starlight", token: "test-token" } : null;
  window.history.replaceState({}, "", "/privacy");
  render(<App />);
  expect(await screen.findByRole("heading", { level: 1, name: /privacy policy/i })).toBeVisible();
  const footer = within(screen.getByRole("navigation", { name: "Footer" }));
  expect(footer.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
  fireEvent.click(footer.getByRole("link", { name: "Terms and Conditions" }));
  expect(await screen.findByRole("heading", { level: 1, name: /terms and conditions/i })).toBeVisible();
  expect(window.location.pathname).toBe("/terms");
});

test("a signed-in visit loads the separate workspace shell and account navigation", async () => {
  mockUser = { username: "Starlight", token: "test-token" };
  window.history.replaceState({}, "", "/");
  render(<App />);
  expect(await screen.findByRole("navigation", { name: "Workspace navigation" }, { timeout: 5000 })).toBeVisible();
  expect(await screen.findByRole("heading", { name: "Find jobs." }, { timeout: 5000 })).toBeVisible();
  expect(window.location.pathname).toBe("/jobs");
  fireEvent.click(screen.getByRole("button", { name: "Open account menu for Starlight" }));
  expect(screen.getByRole("menuitem", { name: "Account settings" })).toHaveAttribute("href", "/dashboard/settings");
  expect(screen.getByRole("menuitem", { name: "Log out" })).toBeVisible();
});

test("an old dashboard link opens job search and passes a selected posting to the application tools", async () => {
  mockUser = { username: "Starlight", token: "test-token" };
  axios.post.mockResolvedValue({ data: { jobs: [
    { id: 42, board: "mozilla", company: "Mozilla", title: "Data analyst", location: "Remote Canada", url: "https://example.org/careers/42", matched_terms: [] },
  ] } });
  axios.get.mockImplementation(url => Promise.resolve({ data: url.endsWith("/42/") ? { description: "Build reports with SQL." } : { jobs: [] } }));
  window.history.replaceState({}, "", "/dashboard");
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: /Mozilla Data analyst/ }));
  expect(await screen.findByRole("link", { name: "Apply" })).toBeVisible();
  fireEvent.click(await screen.findByRole("button", { name: "Check job fit" }));
  expect(await screen.findByRole("textbox", { name: "Job description" })).toHaveValue("Data analyst — Mozilla\n\nRemote Canada\n\nBuild reports with SQL.");
  fireEvent.change(screen.getByLabelText("Upload your resume"), { target: { files: [new File(["SQL reporting"], "analyst.txt")] } });
  fireEvent.click(screen.getByRole("link", { name: "Cover letter" }));
  expect(await screen.findByText("analyst.txt")).toBeVisible();
  expect((await screen.findByRole("textbox", { name: "Job description" })).value).toContain("Build reports with SQL.");
  expect(screen.queryByText(/Lorem Followers/)).not.toBeInTheDocument();
});

test("a signed-in settings deep link keeps its route after loading the workspace shell", async () => {
  mockUser = { username: "Starlight", token: "test-token" };
  axios.get.mockResolvedValue({ data: { username: "Starlight", email: "star@example.com", has_password: true } });
  window.history.replaceState({}, "", "/dashboard/settings/profile");
  render(<App />);
  expect(await screen.findByRole("navigation", { name: "Workspace navigation" }, { timeout: 5000 })).toBeVisible();
  expect(await screen.findByLabelText("Email address", {}, { timeout: 5000 })).toHaveValue("star@example.com");
  expect(window.location.pathname).toBe("/dashboard/settings/profile");
});
