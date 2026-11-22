import React from "react";
import { act, fireEvent, render as renderComponent, screen, waitFor, within } from "@testing-library/react";
import axios from "axios";
import ResumeMatcher from "../../../pages/matching/ResumeMatcher";
import { BASE_URL } from "../../../services/api";
import { ApplicationMaterialsProvider } from "../../../contexts/ApplicationMaterials";

const render = component => renderComponent(component, { wrapper: ApplicationMaterialsProvider });

jest.mock("axios", () => ({ post: jest.fn() }));

const resume = () => new File(["Resume content"], "experience.pdf", { type: "application/pdf" });
const fillInputs = (file = resume()) => {
  fireEvent.change(screen.getByLabelText("Upload your resume"), { target: { files: [file] } });
  fireEvent.change(screen.getByRole("textbox", { name: "Job description" }), { target: { value: "React and TypeScript development" } });
  return file;
};

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

test("requires a supported resume and nonempty description, and removal resets readiness", () => {
  render(<ResumeMatcher />);
  expect(screen.getByRole("button", { name: "Find my match" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Upload your resume"), { target: { files: [new File(["image"], "photo.jpg", { type: "image/jpeg" })] } });
  expect(screen.getByRole("alert")).toHaveTextContent("Please choose a PDF, DOCX, or TXT file.");
  expect(screen.getByRole("button", { name: "Find my match" })).toBeDisabled();
  fillInputs();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByText("experience.pdf")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Find my match" })).toBeEnabled();
  fireEvent.change(screen.getByRole("textbox", { name: "Job description" }), { target: { value: "   " } });
  expect(screen.getByRole("button", { name: "Find my match" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Remove file" }));
  expect(screen.queryByText("experience.pdf")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Upload your resume")).toHaveFocus();
  expect(axios.post).not.toHaveBeenCalled();
});

test("accepts a single dropped DOCX and rejects multiple dropped files without replacing it", () => {
  render(<ResumeMatcher />);
  const zone = screen.getByLabelText("Upload your resume").parentElement;
  fireEvent.dragOver(zone);
  expect(zone).toHaveClass("is-dragging");
  const file = new File(["document"], "experience.DOCX");
  fireEvent.drop(zone, { dataTransfer: { files: [file] } });
  expect(zone).not.toHaveClass("is-dragging");
  expect(screen.getByText("experience.DOCX")).toBeInTheDocument();
  fireEvent.drop(zone, { dataTransfer: { files: [resume(), new File(["text"], "other.txt")] } });
  expect(screen.getByRole("alert")).toHaveTextContent("Choose one resume at a time.");
  expect(screen.getByText("experience.DOCX")).toBeInTheDocument();
  expect(axios.post).not.toHaveBeenCalled();
});

test("submits the selected file and role, displays results, supports adjustments and Q&A", async () => {
  sessionStorage.setItem("token", "matching-session");
  let resolve;
  axios.post.mockImplementation(() => new Promise(done => { resolve = done; }));
  render(<ResumeMatcher />);
  const file = fillInputs();
  fireEvent.click(screen.getByRole("button", { name: "Find my match" }));
  expect(screen.getByRole("button", { name: "Finding your match…" })).toBeDisabled();
  expect(screen.getByRole("textbox", { name: "Job description" })).toBeDisabled();
  expect(screen.getByLabelText("Replace resume")).toBeDisabled();
  const [url, body, config] = axios.post.mock.calls[0];
  expect(url).toBe(`${BASE_URL}/upload-resume/`);
  expect(body.get("resume")).toBe(file);
  expect(body.get("job_description")).toBe("React and TypeScript development");
  expect(config.headers.Authorization).toBe("Bearer matching-session");
  await act(async () => resolve({ data: {
    met_requirements: ["React"], missing_requirements: ["TypeScript"],
    requirement_explanations: { React: "Found React projects.", TypeScript: "Add a TypeScript example." },
    job_notes: ["Hybrid in Ottawa, two office days per week.", "Permanent residents are eligible."],
    ai_suggestions: [{ question: "What should I highlight?", answer: "Discuss the interface you built." }],
  } }));
  const notes = screen.getByRole("region", { name: "Job posting notes" });
  const gaps = screen.getByRole("region", { name: /Areas to explore/ });
  const questions = screen.getByRole("region", { name: /Turn insight/ });
  expect(gaps.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(notes.compareDocumentPosition(questions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(within(notes).getAllByRole("listitem").map(item => item.textContent)).toEqual([
    "Hybrid in Ottawa, two office days per week.", "Permanent residents are eligible.",
  ]);
  expect(within(notes).queryByRole("button")).not.toBeInTheDocument();
  expect(screen.getByLabelText("50% skills match")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "TypeScript" }));
  expect(screen.getByText("Add a TypeScript example.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Yes, I meet this" }));
  expect(screen.getByLabelText("100% skills match")).toBeInTheDocument();
  expect(screen.getByText("Includes your adjustments")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "TypeScript" }));
  fireEvent.click(screen.getByRole("button", { name: "Not yet" }));
  expect(screen.getByLabelText("50% skills match")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "What should I highlight?" }));
  expect(screen.getByText("Discuss the interface you built.")).toBeInTheDocument();
  expect(axios.post).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByRole("textbox", { name: "Job description" }), { target: { value: "A different role" } });
  expect(screen.queryByRole("heading", { name: "See the connection." })).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Job posting notes" })).not.toBeInTheDocument();
});

test("shows request errors inline and retains inputs for a retry", async () => {
  axios.post.mockRejectedValueOnce({ response: { data: { detail: "Please try another resume." } } });
  render(<ResumeMatcher />);
  fillInputs();
  fireEvent.click(screen.getByRole("button", { name: "Find my match" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Please try another resume.");
  await waitFor(() => expect(screen.getByRole("button", { name: "Find my match" })).toBeEnabled());
  expect(screen.getByText("experience.pdf")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Job description" })).toHaveValue("React and TypeScript development");
});

test("rejects oversized resumes before making an upload request", () => {
  render(<ResumeMatcher />);
  const file = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.pdf", { type: "application/pdf" });
  fireEvent.change(screen.getByLabelText("Upload your resume"), { target: { files: [file] } });
  expect(screen.getByRole("alert")).toHaveTextContent("5 MB or smaller");
  expect(screen.getByRole("button", { name: "Find my match" })).toBeDisabled();
  expect(axios.post).not.toHaveBeenCalled();
});

test("explains long job descriptions without silently truncating the pasted text", () => {
  render(<ResumeMatcher />);
  fillInputs();
  const description = screen.getByRole("textbox", { name: "Job description" });
  const text = "a".repeat(30001);
  fireEvent.change(description, { target: { value: text } });
  expect(description).toHaveValue(text);
  expect(description).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("alert")).toHaveTextContent("30,000 characters or fewer");
  expect(screen.getByRole("button", { name: "Find my match" })).toBeDisabled();
  fireEvent.change(description, { target: { value: text.slice(0, 30000) } });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Find my match" })).toBeEnabled();
  expect(axios.post).not.toHaveBeenCalled();
});

test("empty analysis explains that no score was calculated without blaming the posting", async () => {
  axios.post.mockResolvedValueOnce({ data: { met_requirements: [], missing_requirements: [], ai_suggestions: [] } });
  render(<ResumeMatcher />);
  fillInputs(new File(["Resume content"], "experience.txt", { type: "text/plain" }));
  fireEvent.click(screen.getByRole("button", { name: "Find my match" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("No requirements were returned for this analysis");
  expect(screen.queryByRole("heading", { name: "See the connection." })).not.toBeInTheDocument();
  expect(screen.queryByText(/not enough detail/i)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Find my match" })).toBeEnabled();
  expect(screen.queryByText(/NaN|N\/A%/)).not.toBeInTheDocument();
});

test("legacy provider errors never become an empty match or expose their raw answer", async () => {
  axios.post.mockResolvedValueOnce({ data: {
    met_requirements: [], missing_requirements: [], requirement_explanations: {},
    ai_suggestions: [{ question: "Error", answer: "Error code: 404 - model_not_found: retired gpt-4.1-nano; private-key-content" }],
  } });
  render(<ResumeMatcher />);
  fillInputs();
  fireEvent.click(screen.getByRole("button", { name: "Find my match" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("The matching service is unavailable");
  expect(screen.queryByRole("heading", { name: "See the connection." })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Error" })).not.toBeInTheDocument();
  expect(screen.queryByText(/private-key-content|model_not_found|gpt-4.1-nano/)).not.toBeInTheDocument();
  expect(screen.getByText("experience.pdf")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Job description" })).toHaveValue("React and TypeScript development");
  expect(screen.getByRole("button", { name: "Find my match" })).toBeEnabled();
  expect(screen.getByRole("list", { name: "Match progress" }).lastElementChild).not.toHaveClass("is-complete");
});

test.each([
  ["null body", null],
  ["missing fields", {}],
  ["raw top-level error", { error: "private-key-content" }],
  ["invalid requirement type", { met_requirements: "React", missing_requirements: [] }],
  ["overlapping classification", { met_requirements: ["React"], missing_requirements: ["React"] }],
  ["malformed explanation", { met_requirements: ["React"], missing_requirements: [], requirement_explanations: { React: {} } }],
  ["malformed Q&A", { met_requirements: ["React"], missing_requirements: [], ai_suggestions: [{ question: "How?", answer: {} }] }],
  ["malformed notes", { met_requirements: ["React"], missing_requirements: [], job_notes: [{}] }],
])("rejects malformed response: %s", async (_name, data) => {
  axios.post.mockResolvedValueOnce({ data });
  render(<ResumeMatcher />);
  fillInputs();
  fireEvent.click(screen.getByRole("button", { name: "Find my match" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("The matching service is unavailable");
  expect(screen.queryByRole("heading", { name: "See the connection." })).not.toBeInTheDocument();
  expect(screen.queryByText(/private-key-content/)).not.toBeInTheDocument();
});

test("zero matched requirements is a valid zero score when requirements were identified", async () => {
  axios.post.mockResolvedValueOnce({ data: {
    met_requirements: [], missing_requirements: ["React"], requirement_explanations: { React: "No React experience found." },
    ai_suggestions: [],
  } });
  render(<ResumeMatcher />);
  fillInputs();
  fireEvent.click(screen.getByRole("button", { name: "Find my match" }));
  expect(await screen.findByLabelText("0% skills match")).toHaveTextContent("0%");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByText("0 of 1 listed skill")).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Job posting notes" })).not.toBeInTheDocument();
});

test("shows posting notes without assigning a percentage when there are no skills to score", async () => {
  axios.post.mockResolvedValueOnce({ data: {
    met_requirements: [], missing_requirements: [], ai_suggestions: [],
    job_notes: ["Remote within Canada."],
  } });
  render(<ResumeMatcher />);
  fillInputs();
  fireEvent.click(screen.getByRole("button", { name: "Find my match" }));
  const notes = await screen.findByRole("region", { name: "Job posting notes" });
  expect(within(notes).getByText("Remote within Canada.")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "No role-specific skills to score" })).toBeInTheDocument();
  expect(screen.getByLabelText("No skills score")).not.toHaveTextContent("%");
  expect(screen.queryByRole("region", { name: /Areas to explore/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
