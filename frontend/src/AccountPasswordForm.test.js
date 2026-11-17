import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import axios from "axios";
import AccountPasswordForm from "./AccountPasswordForm";
import { useAuth } from "./AuthContext";
import { BASE_URL } from "./api";

jest.mock("axios", () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock("./AuthContext", () => ({ useAuth: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ user: { token: "session-token" } });
  axios.post.mockResolvedValue({ data: {} });
});

test("Google-only users can add a password without a current password", async () => {
  axios.get.mockResolvedValue({ data: { has_password: false, google_linked: true } });
  render(<AccountPasswordForm />);
  await screen.findByRole("button", { name: "Set password" });
  expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: "new-password-123" } });
  fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "new-password-123" } });
  fireEvent.click(screen.getByRole("button", { name: "Set password" }));
  await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1));
  const [url, form, config] = axios.post.mock.calls[0];
  expect(url).toBe(`${BASE_URL}/account/set-password/`);
  expect(Array.from(form.entries())).toEqual([["new_password", "new-password-123"]]);
  expect(config.headers.Authorization).toBe("Bearer session-token");
  expect(await screen.findByLabelText("Current password")).toBeVisible();
});

test("accounts with a password keep the current-password change flow", async () => {
  axios.get.mockResolvedValue({ data: { has_password: true } });
  render(<AccountPasswordForm />);
  fireEvent.change(await screen.findByLabelText("Current password"), { target: { value: "old-password" } });
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: "new-password" } });
  fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "different-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Update password" }));
  expect(screen.getByRole("alert")).toHaveTextContent("do not match");
  expect(axios.post).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "new-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Update password" }));
  await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1));
  expect(axios.post.mock.calls[0][0]).toBe(`${BASE_URL}/account/change-password/`);
  expect(Array.from(axios.post.mock.calls[0][1].entries())).toEqual([["current_password", "old-password"], ["new_password", "new-password"]]);
});
