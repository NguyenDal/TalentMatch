import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import axios from "axios";
import JobSearch from "../../../pages/jobs/JobSearch";
import { ApplicationMaterialsProvider } from "../../../contexts/ApplicationMaterials";

jest.mock("react-router-dom", () => {
  global.TextEncoder = require("util").TextEncoder;
  return jest.requireActual("react-router");
}, { virtual: true });
jest.mock("axios", () => ({ get: jest.fn(), post: jest.fn(), put: jest.fn() }));

const opening = { id: 16, board: "d2l", company: "D2L", title: "Account manager", location: "Canada", matched_terms: [], url: "https://www.d2l.com/careers/jobs/" };
const showSearch = () => render(<MemoryRouter><ApplicationMaterialsProvider><JobSearch /></ApplicationMaterialsProvider></MemoryRouter>);
beforeEach(() => {
  jest.resetAllMocks();
  axios.get.mockImplementation(url => Promise.resolve({ data: url.endsWith("/applied-jobs/") ? { jobs: [] } : { description: "Role summary" } }));
});

test("expands employer sections and displays their original bullet points", async () => {
  axios.post.mockResolvedValue({ data: { jobs: [opening] } });
  axios.get.mockResolvedValueOnce({ data: { jobs: [] } }).mockResolvedValueOnce({ data: {
    description: "Join the team.\nResponsibilities\nManage accounts.\nSupport customers.",
    description_sections: [
      { title: "", blocks: [{ type: "paragraph", text: "Join the team." }] },
      { title: "Responsibilities", blocks: [{ type: "ul", items: ["Manage accounts.", "Support customers."] }] },
    ],
  } });
  showSearch();
  fireEvent.click(await screen.findByRole("button", { name: /Account manager/ }));
  expect(await screen.findByRole("region", { name: /Account manager job description/ })).toBeVisible();
  expect(screen.getByText("Join the team.")).toBeVisible();
  expect(screen.getByText("Manage accounts.")).not.toBeVisible();
  fireEvent.click(screen.getByText("Responsibilities"));
  expect(screen.getByText("Manage accounts.").closest("li")).toBeVisible();
  expect(screen.getByText("Support customers.").closest("ul")).toBeVisible();
});

test("shows each employer's logo beside its name without repeating it to screen readers", async () => {
  const employers = [["affirm", "Affirm", "affirm.png"], ["d2l", "D2L", "d2l.svg"], ["mozilla", "Mozilla", "mozilla.png"]];
  const jobs = employers.map(([board, company]) => ({ ...opening, board, company }));
  axios.post.mockResolvedValue({ data: { jobs } });
  showSearch();
  for (const [, company, file] of employers) {
    const summary = await screen.findByRole("button", { name: `${company} Account manager Canada` });
    expect(within(summary).getByAltText("")).toHaveAttribute("src", file);
  }
});

test("uploads the selected résumé for ranking with the current filters", async () => {
  axios.post.mockResolvedValueOnce({ data: { jobs: [opening] } })
    .mockResolvedValueOnce({ data: { jobs: [{ ...opening, matched_terms: ["CRM"] }], unavailable_boards: ["Mozilla"] } });
  showSearch();
  const results = screen.getByRole("region", { name: "Open positions" });
  expect(results).toHaveAttribute("aria-busy", "true");
  expect(results.querySelector(".tm-job-skeleton")).toHaveAttribute("aria-hidden", "true");
  expect(await screen.findByText("Account manager")).toBeVisible();
  expect(results).toHaveAttribute("aria-busy", "false");
  expect(results.querySelector(".tm-job-skeleton")).toBeNull();
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
  showSearch();
  const summary = await screen.findByRole("button", { name: /Account manager/ });
  axios.get.mockRejectedValueOnce({ response: { data: { detail: "This posting is no longer available." } } });
  fireEvent.click(summary);
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/no longer available/));
  expect(screen.getByRole("link", { name: "Apply" })).toHaveAttribute("href", opening.url);
  expect(screen.queryByRole("button", { name: "Cover letter" })).toBeNull();
});

test("asks after opening the employer site and moves only a confirmed job to Applied jobs", async () => {
  const sameTitle = { ...opening, id: 17, location: "Remote US" };
  axios.post.mockResolvedValue({ data: { jobs: [opening, sameTitle] } });
  axios.put.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ data: opening });
  showSearch();
  fireEvent.click(await screen.findByRole("button", { name: /Account manager Canada/ }));
  const link = screen.getByRole("link", { name: "Apply" });
  expect(link).toHaveAttribute("target", "_blank");
  fireEvent.click(link);
  expect(screen.getByText("Did you apply for this job?")).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Not yet" }));
  expect(link).toHaveFocus();
  expect(axios.put).not.toHaveBeenCalled();
  fireEvent.click(link);
  fireEvent.click(screen.getByRole("button", { name: "Yes, I applied" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("couldn’t save");
  fireEvent.click(screen.getByRole("button", { name: "Yes, I applied" }));
  expect(await screen.findByText("Account manager moved to Applied jobs.")).toBeVisible();
  expect(screen.queryByRole("button", { name: /Account manager Canada/ })).toBeNull();
  expect(screen.getByRole("button", { name: /Account manager Remote US/ })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Applied jobs" }));
  fireEvent.click(screen.getByRole("button", { name: /Account manager Canada/ }));
  expect(screen.getByRole("link", { name: "View employer posting" })).toHaveAttribute("href", opening.url);
  expect(screen.queryByRole("button", { name: /Account manager Remote US/ })).toBeNull();
  expect(screen.queryByRole("link", { name: "Apply" })).toBeNull();
  await screen.findByRole("region", { name: /Account manager job description/ });
});

test("excludes saved jobs on a fresh visit and keeps them accessible when employer boards are offline", async () => {
  axios.get.mockResolvedValue({ data: { jobs: [opening] } });
  axios.post.mockResolvedValueOnce({ data: { jobs: [opening] } }).mockRejectedValueOnce(new Error("offline"));
  showSearch();
  expect(await screen.findByText("0 openings")).toBeVisible();
  expect(screen.queryByText(opening.title)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Search jobs" }));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Applied jobs" }));
  expect(screen.getByRole("button", { name: /Account manager Canada/ })).toBeVisible();
  expect(screen.queryByRole("alert")).toBeNull();
});
