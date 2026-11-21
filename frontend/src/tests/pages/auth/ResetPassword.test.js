import React from "react";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import axios from "axios";
import ResetPassword from "../../../pages/auth/ResetPassword";

jest.mock("react-router-dom", () => {
  global.TextEncoder = require("util").TextEncoder;
  return jest.requireActual("react-router");
}, { virtual: true });
jest.mock("axios", () => ({ post: jest.fn() }));

test.each(["#token=current-link", "?token=older-link"])("opens a reset email with %s", async suffix => {
  axios.post.mockClear().mockResolvedValue({ data: { ok: true } });
  render(
    <MemoryRouter initialEntries={[`/reset-password${suffix}`]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ResetPassword />
    </MemoryRouter>
  );
  await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1));
  const [url, form] = axios.post.mock.calls[0];
  expect(url).toMatch(/\/verify-password-reset\/$/);
  expect(form.get("token")).toBe(suffix.split("=")[1]);
});
