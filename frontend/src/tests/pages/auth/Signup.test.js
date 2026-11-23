import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import axios from "axios";
import Signup from "../../../pages/auth/Signup";

jest.mock("react-router-dom", () => {
  global.TextEncoder = require("util").TextEncoder;
  return jest.requireActual("react-router");
}, { virtual: true });
jest.mock("axios", () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock("../../../components/auth/GoogleAuth", () => () => null);

test("password signup requires an unchecked agreement and submits its version with registration", async () => {
  axios.get.mockResolvedValue({ data: { available: true, valid: true, message: "Username is available." } });
  axios.post.mockResolvedValue({ data: {} });
  const onLogin = jest.fn();
  render(<MemoryRouter><Signup onLogin={onLogin} /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "first_user" } });
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "first@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "test-password" } });
  await screen.findByText("Username is available.");
  const checkbox = screen.getByRole("checkbox", { name: /^I agree to the Privacy Policy and Terms and Conditions\s*\.$/ });
  expect(checkbox.labels[0].textContent).toBe("I agree to the Privacy Policy and Terms and Conditions. *");
  expect(screen.getByText("*")).toHaveAttribute("aria-hidden", "true");
  const submit = screen.getByRole("button", { name: "Create account" });
  expect(checkbox).not.toBeChecked();
  expect(checkbox).toBeRequired();
  expect(submit).toBeDisabled();
  for (const [name, path] of [["Terms and Conditions", "/terms"], ["Privacy Policy", "/privacy"]]) {
    const link = screen.getByRole("link", { name });
    expect(link).toHaveAttribute("href", path);
    expect(link).toHaveAttribute("target", "_blank");
  }
  fireEvent.submit(checkbox.closest("form"));
  expect(axios.post).not.toHaveBeenCalled();
  fireEvent.click(checkbox);
  fireEvent.click(submit);
  await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
  expect(axios.post.mock.calls[0][1].get("accepted_policy_version")).toBe("2026-11-23");
  expect(axios.post.mock.calls[1][1].has("accepted_policy_version")).toBe(false);
});
