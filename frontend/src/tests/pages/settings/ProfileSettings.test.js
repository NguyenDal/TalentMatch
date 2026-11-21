import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import axios from "axios";
import ProfileSettings from "../../../pages/settings/ProfileSettings";
import { useAuth } from "../../../contexts/AuthContext";
import { BASE_URL } from "../../../services/api";

jest.mock("react-router-dom", () => {
  global.TextEncoder = require("util").TextEncoder;
  return jest.requireActual("react-router");
}, { virtual: true });
jest.mock("axios", () => ({ get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() }));
jest.mock("../../../contexts/AuthContext", () => ({ useAuth: jest.fn() }));

const account = { username: "Starlight", email: "star@example.com", profession: "Computer science", bio: "Software engineer", has_password: false, email_verified: false };
const logout = jest.fn();
function openSettings(path = "profile") {
  return render(<MemoryRouter initialEntries={[`/dashboard/settings/${path}`]}><Routes><Route path="/dashboard/settings/*" element={<div className="tm-app-shell"><ProfileSettings /></div>} /><Route path="/login" element={<p>Signed out</p>} /></Routes></MemoryRouter>);
}
beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ user: { token: "session-token", username: "Starlight" }, logout });
  axios.get.mockResolvedValue({ data: account });
  axios.patch.mockResolvedValue({ data: {} });
  axios.post.mockResolvedValue({ data: {} });
});

test("profile has initials instead of a remote placeholder and saves the existing fields with auth", async () => {
  openSettings();
  expect(await screen.findByLabelText("Starlight profile initials")).toHaveTextContent("ST");
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute("aria-current", "page");
  fireEvent.change(screen.getByLabelText("Field of study"), { target: { value: "Applied computer science" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Your profile has been saved");
  const [url, form, config] = axios.patch.mock.calls[0];
  expect(url).toBe(`${BASE_URL}/profile/update/`);
  expect(Array.from(form.entries())).toEqual([["email", "star@example.com"], ["profession", "Applied computer science"], ["bio", "Software engineer"]]);
  expect(config.headers.Authorization).toBe("Bearer session-token");
});

test("a failed profile load cannot overwrite an account with empty data", async () => {
  axios.get.mockRejectedValueOnce(new Error("offline"));
  openSettings();
  expect(await screen.findByRole("alert")).toHaveTextContent("couldn’t be loaded");
  expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByLabelText("Email address")).toHaveValue("star@example.com");
});

test("a broken avatar falls back to initials and picture removal updates the shared avatar", async () => {
  axios.get.mockResolvedValue({ data: { ...account, profile_image_url: "https://example.com/avatar.jpg" } });
  const listener = jest.fn();
  window.addEventListener("talentmatch:profile-image-updated", listener);
  openSettings();
  fireEvent.error(await screen.findByRole("img"));
  expect(screen.getByLabelText("Starlight profile initials")).toHaveTextContent("ST");
  fireEvent.click(screen.getByRole("button", { name: "Remove profile picture" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Profile picture removed");
  expect(axios.post).toHaveBeenCalledWith(`${BASE_URL}/profile/clear-image/`, {}, { headers: { Authorization: "Bearer session-token" } });
  expect(listener.mock.calls[0][0].detail).toEqual({ url: "" });
  expect(screen.getByLabelText("Upload profile picture")).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
  window.removeEventListener("talentmatch:profile-image-updated", listener);
});

test("account verification retains cooldown and does not send to an unsaved email", async () => {
  openSettings("account");
  const email = await screen.findByLabelText("Primary email");
  fireEvent.change(email, { target: { value: "updated@example.com" } });
  expect(screen.getByRole("button", { name: "Send code" })).toBeDisabled();
  axios.patch.mockResolvedValue({ data: { email_changed: true, email_verified: false } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Send code" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Send code" }));
  expect(await screen.findByRole("button", { name: /Send again in/ })).toBeDisabled();
  axios.post.mockResolvedValue({ data: { email_verified: true } });
  fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify email" }));
  expect(await screen.findByText("Your saved email is verified.")).toBeVisible();
  expect(axios.post.mock.calls[1][0]).toBe(`${BASE_URL}/account/verify-email/`);
  expect(axios.post.mock.calls[1][1].get("code")).toBe("123456");
});

test("canceling account deletion leaves the account intact", async () => {
  const confirm = jest.spyOn(window, "confirm").mockReturnValue(false);
  openSettings("account");
  fireEvent.click(await screen.findByRole("button", { name: "Delete account" }));
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(axios.delete).not.toHaveBeenCalled();
  expect(logout).not.toHaveBeenCalled();
  confirm.mockRestore();
});

test("security preserves passwordless setup, current-device identification and remote sign-out", async () => {
  const events = [
    { session_id: "current", current_session: true, device: "Windows Chrome/120", timestamp: "2026-11-01T10:00:00Z", ip: "127.0.0.1" },
    { session_id: "other", device: "iPhone Safari", timestamp: "2026-11-01T09:00:00Z", ip: "127.0.0.2" },
  ];
  axios.get.mockImplementation((url) => Promise.resolve({ data: url.includes("login-activity") ? { events } : account }));
  const confirm = jest.spyOn(window, "confirm").mockReturnValue(true);
  openSettings("security");
  expect(await screen.findByRole("button", { name: "Set password" })).toBeVisible();
  expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument();
  expect(await screen.findByText("This device")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /Sign out iPhone/ }));
  await waitFor(() => expect(axios.post).toHaveBeenCalledWith(`${BASE_URL}/account/logout-session/`, { session_id: "other" }, { headers: { Authorization: "Bearer session-token" } }));
  expect(logout).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByRole("button", { name: "Sign out all devices" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Sign out all devices" }));
  expect(await screen.findByText("Signed out")).toBeVisible();
  expect(logout).toHaveBeenCalledTimes(1);
  confirm.mockRestore();
});

test("notifications accurately shows its unavailable state and links to account settings", async () => {
  openSettings("notifications");
  expect(screen.getByText("No notification preferences yet")).toBeVisible();
  fireEvent.click(screen.getByRole("link", { name: "Manage account email" }));
  expect(await screen.findByLabelText("Primary email")).toHaveValue("star@example.com");
});
