import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import axios from "axios";
import NavBar from "./NavBar";
import ProfileSettings from "./ProfileSettings";

jest.mock("react-router-dom", () => {
  global.TextEncoder = require("util").TextEncoder;
  return jest.requireActual("react-router");
}, { virtual: true });
jest.mock("axios", () => ({ get: jest.fn() }));
const mockLogout = jest.fn();
const mockUser = { username: "Starlight", token: "test-token" };
jest.mock("./AuthContext", () => ({ useAuth: () => ({
  user: mockUser, logout: mockLogout,
}) }));
jest.mock("./ThemeToggle", () => () => <button>Theme</button>);

function Harness() {
  const location = useLocation();
  return <><NavBar /><p data-testid="route">{location.pathname}</p><button>Outside</button>
    <Routes>
      <Route path="/dashboard/settings/*" element={<ProfileSettings />} />
      <Route path="*" element={null} />
    </Routes>
  </>;
}

beforeEach(() => {
  jest.clearAllMocks();
  axios.get.mockResolvedValue({ data: { username: "Starlight", profile_image_url: "" } });
});

async function renderNav() {
  render(<MemoryRouter><Harness /></MemoryRouter>);
  await waitFor(() => expect(axios.get).toHaveBeenCalled());
  return screen.getByRole("button", { name: "Open account menu for Starlight" });
}

test("avatar menu supports keyboard navigation, Escape focus return and outside dismissal", async () => {
  const avatar = await renderNav();
  fireEvent.keyDown(avatar, { key: "ArrowDown" });
  expect(avatar).toHaveAttribute("aria-expanded", "true");
  const dashboard = screen.getByRole("menuitem", { name: "Dashboard" });
  const settings = screen.getByRole("menuitem", { name: "Account settings" });
  expect(dashboard).toHaveFocus();
  fireEvent.keyDown(dashboard, { key: "ArrowDown" });
  expect(settings).toHaveFocus();
  fireEvent.keyDown(settings, { key: "End" });
  expect(screen.getByRole("menuitem", { name: "Log out" })).toHaveFocus();
  fireEvent.keyDown(settings, { key: "Escape" });
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(avatar).toHaveFocus();
  fireEvent.click(avatar);
  fireEvent.pointerDown(screen.getByText("Outside"));
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

test("menu routes to settings, closes and retains working workspace navigation", async () => {
  const avatar = await renderNav();
  fireEvent.click(avatar);
  await act(async () => { fireEvent.click(screen.getByRole("menuitem", { name: "Account settings" })); });
  expect(screen.getByTestId("route")).toHaveTextContent("/dashboard/settings/profile");
  expect(await screen.findByRole("button", { name: "Change picture" })).toBeVisible();
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  await act(async () => { fireEvent.click(screen.getByRole("link", { name: "Job matching" })); });
  expect(screen.getByTestId("route")).toHaveTextContent(/^\/$/);
  fireEvent.click(avatar);
  fireEvent.click(screen.getByRole("menuitem", { name: "Log out" }));
  expect(mockLogout).toHaveBeenCalledTimes(1);
});

test("an unknown settings path falls back to the public-profile settings", async () => {
  render(<MemoryRouter initialEntries={["/dashboard/settings/unknown"]}><Harness /></MemoryRouter>);
  expect(await screen.findByRole("button", { name: "Change picture" })).toBeVisible();
  expect(screen.getByTestId("route")).toHaveTextContent("/dashboard/settings/profile");
});

test("avatar follows upload/removal events and falls back to initials on image error", async () => {
  const avatar = await renderNav();
  expect(avatar).toHaveTextContent("ST");
  act(() => window.dispatchEvent(new CustomEvent("talentmatch:profile-image-updated", { detail: { url: "https://example.com/avatar.jpg" } })));
  expect(avatar.querySelector("img")).toHaveAttribute("src", "https://example.com/avatar.jpg");
  fireEvent.error(avatar.querySelector("img"));
  expect(avatar.querySelector("img")).toBeNull();
  expect(avatar).toHaveTextContent("ST");
  act(() => window.dispatchEvent(new CustomEvent("talentmatch:profile-image-updated", { detail: { url: "" } })));
  expect(avatar).toHaveTextContent("ST");
});
