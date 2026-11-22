import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import axios from "axios";
import JobSearch from "../../../pages/jobs/JobSearch";
import { ApplicationMaterialsProvider } from "../../../contexts/ApplicationMaterials";

jest.mock("react-router-dom", () => {
  global.TextEncoder = require("util").TextEncoder;
  return jest.requireActual("react-router");
}, { virtual: true });
jest.mock("axios", () => ({ get: jest.fn(), post: jest.fn() }));

const opening = { id: 16, board: "d2l", company: "D2L", title: "Account manager", location: "Canada", matched_terms: [], url: "https://www.d2l.com/careers/jobs/" };
const showSearch = () => render(<MemoryRouter><ApplicationMaterialsProvider><JobSearch /></ApplicationMaterialsProvider></MemoryRouter>);
beforeEach(() => jest.resetAllMocks());

test("uploads the selected résumé for ranking with the current filters", async () => {
  axios.post.mockResolvedValueOnce({ data: { jobs: [opening] } })
    .mockResolvedValueOnce({ data: { jobs: [{ ...opening, matched_terms: ["CRM"] }], unavailable_boards: ["Mozilla"] } });
  showSearch();
  expect(await screen.findByText("Account manager")).toBeVisible();
  fireEvent.change(screen.getByRole("textbox", { name: "Location" }), { target: { value: "Canada" } });
  const file = new File(["Managed customer relationships with CRM software."], "sales.txt");
  fireEvent.change(screen.getByLabelText("Upload a résumé for job search"), { target: { files: [file] } });
  expect(await screen.findByText(/Temporarily unavailable: Mozilla/)).toBeVisible();
  const form = axios.post.mock.calls[1][1];
  expect(form.get("resume")).toBe(file);
  expect(form.get("location")).toBe("Canada");
  expect(screen.getByText("In your résumé").parentElement).toHaveTextContent("CRM");
});

test("a withdrawn posting keeps the employer link available and cannot prefill a draft", async () => {
  axios.post.mockResolvedValue({ data: { jobs: [opening] } });
  axios.get.mockRejectedValue({ response: { data: { detail: "This posting is no longer available." } } });
  showSearch();
  fireEvent.click(await screen.findByRole("button", { name: /Account manager/ }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/no longer available/));
  expect(screen.getByRole("link", { name: "Employer posting" })).toHaveAttribute("href", opening.url);
  expect(screen.queryByRole("button", { name: "Cover letter" })).toBeNull();
});
