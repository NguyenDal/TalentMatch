import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axios from "axios";
import GoogleAuth from "../../../components/auth/GoogleAuth";
import { useAuth } from "../../../contexts/AuthContext";
import { BASE_URL } from "../../../services/api";

jest.mock("axios", () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock("../../../contexts/AuthContext", () => ({ useAuth: jest.fn() }));

const auth = { access_token: "valid-token", username: "chosen_user", email: "user@gmail.com" };
let popup;
let setAuthData;
const deliver = (data, origin = new URL(BASE_URL).origin, source = popup) => {
  act(() => window.dispatchEvent(new MessageEvent("message", { origin, source, data: { type: "talentmatch:google-auth", ...data } })));
};

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});

beforeEach(() => {
  jest.clearAllMocks();
  setAuthData = jest.fn();
  useAuth.mockReturnValue({ setAuthData });
  axios.get.mockResolvedValue({ data: { enabled: true } });
  axios.post.mockResolvedValue({ data: { ...auth, remember: true } });
  popup = { closed: false, close: jest.fn(), focus: jest.fn() };
  jest.spyOn(window, "open").mockReturnValue(popup);
});

afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

async function begin(props = {}) {
  render(<div className="tm-auth"><GoogleAuth {...props} /></div>);
  const button = screen.getByRole("button", { name: "Continue with Google" });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  return button;
}

test("only accepts messages from the backend and the exact popup, preserving remember", async () => {
  await begin({ remember: true });
  expect(window.open.mock.calls[0][0]).toContain("remember=true");
  deliver({ status: "success", auth, remember: true }, "https://untrusted.example");
  deliver({ status: "success", auth, remember: true }, new URL(BASE_URL).origin, window);
  expect(setAuthData).not.toHaveBeenCalled();
  deliver({ status: "success", auth, remember: true });
  expect(setAuthData).toHaveBeenCalledWith({ token: auth.access_token, email: auth.email, username: auth.username }, true);
});

test("matching email requires explicit confirmation before storing any session", async () => {
  await begin();
  deliver({ status: "link_required", ticket: "pending-link", email: auth.email, replaces_unverified_password: true });
  expect(screen.getByRole("dialog", { name: "Link your account to Google?" })).toBeVisible();
  expect(screen.getByText(/replace its existing password/)).toBeVisible();
  expect(setAuthData).not.toHaveBeenCalled();
  expect(axios.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Link & sign in" }));
  await waitFor(() => expect(setAuthData).toHaveBeenCalledTimes(1));
  expect(axios.post).toHaveBeenCalledWith(`${BASE_URL}/auth/google/link/`, { ticket: "pending-link", confirm: true }, { withCredentials: true });
});

test("cancelling link discards the ticket, restores focus, and does not authenticate", async () => {
  const button = await begin();
  deliver({ status: "link_required", ticket: "cancel-me", email: auth.email });
  fireEvent.click(screen.getByRole("button", { name: "Not now" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(button).toHaveFocus();
  expect(setAuthData).not.toHaveBeenCalled();
  expect(axios.post).toHaveBeenCalledWith(`${BASE_URL}/auth/google/cancel/`, { ticket: "cancel-me" }, { withCredentials: true });
  expect(localStorage.getItem("ticket")).toBeNull();
});

test("password challenge errors stay in the link dialog", async () => {
  await begin();
  deliver({ status: "link_required", ticket: "protected", email: "user@example.com", requires_password: true });
  axios.post.mockRejectedValueOnce({ response: { status: 401, data: { detail: "Incorrect password." } } });
  fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "wrong-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Link & sign in" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect password.");
  expect(screen.getByRole("dialog")).toBeVisible();
  expect(setAuthData).not.toHaveBeenCalled();
  expect(axios.post.mock.calls[0][1]).toEqual({ ticket: "protected", confirm: true, password: "wrong-password" });
});

test("new Google account asks only for a unique username and submits no personal names or password", async () => {
  await begin();
  deliver({ status: "signup_required", ticket: "new-user", email: auth.email });
  expect(screen.getByLabelText("Username")).toHaveValue("");
  expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/first name|last name/i)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Create account" })).toBeDisabled();
  axios.get.mockResolvedValueOnce({ data: { available: true, valid: true, message: "This username is available." } });
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "chosen_user" } });
  await waitFor(() => expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  await waitFor(() => expect(setAuthData).toHaveBeenCalledTimes(1));
  expect(axios.post).toHaveBeenCalledWith(`${BASE_URL}/auth/google/signup/`, { ticket: "new-user", username: "chosen_user" }, { withCredentials: true });
});

test("reports blocked popups without starting a session", async () => {
  window.open.mockReturnValue(null);
  await begin();
  expect(screen.getByRole("alert")).toHaveTextContent("blocked");
  expect(setAuthData).not.toHaveBeenCalled();
});
