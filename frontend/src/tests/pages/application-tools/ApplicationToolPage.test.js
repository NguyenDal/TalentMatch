import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import axios from "axios";
import ApplicationToolPage from "../../../pages/application-tools/ApplicationToolPage";
import { ApplicationMaterialsProvider } from "../../../contexts/ApplicationMaterials";
import { BASE_URL } from "../../../services/api";

jest.mock("axios", () => ({ post: jest.fn() }));

const letter = {
  name: "Taylor Example", contact: ["taylor@example.test"], links: [], date: "March 1, 2026",
  recipient: ["Hiring Team"], subject: "Reporting Analyst", salutation: "Dear Hiring Team,",
  paragraphs: ["I built SQL reports."], closing: "Sincerely,", signature: "Taylor Example",
};

function renderTool(tool) {
  const view = next => <ApplicationMaterialsProvider><ApplicationToolPage tool={next} /></ApplicationMaterialsProvider>;
  const { rerender } = render(view(tool));
  return next => rerender(view(next));
}

function fillMaterials() {
  const file = new File(["Built SQL reports."], "reporting.txt", { type: "text/plain" });
  fireEvent.change(screen.getByLabelText("Source resume"), { target: { files: [file] } });
  fireEvent.change(screen.getByLabelText("Job description"), { target: { value: "Write SQL reports." } });
  return file;
}

beforeEach(() => { axios.post.mockReset(); sessionStorage.clear(); });

test("creates an authenticated cover letter, retains edits across tools, and copies the edited letter", async () => {
  sessionStorage.setItem("token", "session");
  const switchTool = renderTool("cover-letter");
  const file = fillMaterials();
  axios.post.mockResolvedValueOnce({ data: { letter } });
  fireEvent.click(screen.getByRole("button", { name: "Draft cover letter" }));
  fireEvent.click(await screen.findByRole("button", { name: "Edit letter" }));
  const editor = screen.getByLabelText(/Body paragraphs/);
  const [url, form, config] = axios.post.mock.calls[0];
  expect(url).toBe(`${BASE_URL}/application-tools/cover-letter/`);
  expect(form.get("resume")).toBe(file);
  expect(form.get("job_description")).toBe("Write SQL reports.");
  expect(form.has("question")).toBe(false);
  const today = new Date();
  const localDate = form.get("letter_date").split("-").map(Number);
  expect(localDate).toEqual([today.getFullYear(), today.getMonth() + 1, today.getDate()]);
  expect(config.headers.Authorization).toBe("Bearer session");
  fireEvent.change(editor, { target: { value: "I designed monthly reports." } });
  switchTool("question");
  expect(screen.getByLabelText("Job description")).toHaveValue("Write SQL reports.");
  expect(screen.queryByLabelText("Edit your answer")).not.toBeInTheDocument();
  switchTool("cover-letter");
  expect(screen.getAllByText("I designed monthly reports.").length).toBeGreaterThan(0);
  const writeText = jest.fn().mockResolvedValue();
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  fireEvent.click(screen.getByRole("button", { name: "Copy" }));
  expect(await screen.findByText("Copied to clipboard", { selector: '[role="status"]' })).toBeVisible();
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Re: Reporting Analyst\n\nDear Hiring Team,\n\nI designed monthly reports."));
  expect(screen.getByRole("button", { name: "Print / Save PDF" })).toBeEnabled();
});

test("sends the user's individual question and clears the previous answer when it changes", async () => {
  renderTool("question");
  fillMaterials();
  const question = screen.getByLabelText("Application question");
  const submit = screen.getByRole("button", { name: "Draft answer" });
  expect(submit).toBeDisabled();
  fireEvent.change(question, { target: { value: "Which reporting projects have you completed?" } });
  axios.post.mockResolvedValueOnce({ data: { text: "I delivered monthly reports." } });
  fireEvent.click(submit);
  expect(await screen.findByLabelText("Edit your answer")).toHaveValue("I delivered monthly reports.");
  expect(axios.post.mock.calls[0][1].get("question")).toBe("Which reporting projects have you completed?");
  expect(screen.queryByRole("button", { name: "Print / PDF" })).not.toBeInTheDocument();
  fireEvent.change(question, { target: { value: "q".repeat(2001) } });
  expect(screen.queryByLabelText("Edit your answer")).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("2,000");
  expect(submit).toBeDisabled();
});

test("an in-flight response is discarded after changing source materials or switching to another tool", async () => {
  const switchTool = renderTool("cover-letter");
  fillMaterials();
  for (const change of ["source", "route"]) {
    let resolve;
    axios.post.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    fireEvent.click(screen.getByRole("button", { name: "Draft cover letter" }));
    const signal = axios.post.mock.calls.at(-1)[2].signal;
    if (change === "source") {
      fireEvent.change(screen.getByLabelText("Job description"), { target: { value: "A different posting" } });
    } else {
      switchTool("resume");
    }
    expect(signal.aborted).toBe(true);
    await act(async () => resolve({ data: { letter } }));
    switchTool("cover-letter");
    expect(screen.queryByRole("button", { name: "Edit letter" })).not.toBeInTheDocument();
  }
});

test("rejects a malformed letter without overwriting the last usable draft", async () => {
  renderTool("cover-letter");
  fillMaterials();
  axios.post.mockResolvedValueOnce({ data: { letter } });
  fireEvent.click(screen.getByRole("button", { name: "Draft cover letter" }));
  expect(await screen.findByRole("button", { name: "Edit letter" })).toBeEnabled();
  axios.post.mockResolvedValueOnce({ data: { letter: { ...letter, paragraphs: [null] } } });
  fireEvent.click(screen.getByRole("button", { name: "Regenerate draft" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("couldn’t generate");
  expect(screen.getAllByText("I built SQL reports.").length).toBeGreaterThan(0);
});

test("validates files and handles an unavailable service or malformed resume without losing inputs", async () => {
  renderTool("resume");
  fireEvent.change(screen.getByLabelText("Source resume"), { target: { files: [new File(["png"], "other.png")] } });
  expect(screen.getByRole("alert")).toHaveTextContent("PDF, DOCX, or TXT");
  const submit = screen.getByRole("button", { name: "Build resume" });
  expect(submit).toBeDisabled();
  fillMaterials();
  axios.post.mockRejectedValueOnce({ response: { data: { detail: "Please retry shortly." } } });
  fireEvent.click(submit);
  expect(await screen.findByRole("alert")).toHaveTextContent("Please retry shortly.");
  axios.post.mockResolvedValueOnce({ data: { resume: { contact: [{}] } } });
  fireEvent.click(submit);
  expect(await screen.findByRole("alert")).toHaveTextContent("couldn’t generate");
  expect(screen.getByLabelText("Job description")).toHaveValue("Write SQL reports.");
});

test("renders the resume in the document editor and clears it when the source is removed", async () => {
  renderTool("resume");
  fillMaterials();
  axios.post.mockResolvedValueOnce({ data: { resume: {
    name: "Taylor Example", contact: [], education: [], experience: [], projects: [],
    skills: [{ category: "Data", items: ["SQL"] }],
  } } });
  fireEvent.click(screen.getByRole("button", { name: "Build resume" }));
  expect((await screen.findAllByRole("heading", { name: "Taylor Example" })).length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: "Remove file" }));
  expect(screen.queryByRole("heading", { name: "Taylor Example" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Build resume" })).toBeDisabled();
});
