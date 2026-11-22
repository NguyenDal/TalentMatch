import React, { useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import CoverLetterDocument, { coverLetterText } from "../../../pages/application-tools/CoverLetterDocument";

const example = {
  name: "Morgan Example", contact: ["morgan@example.test"], links: ["portfolio.example.test"],
  date: "April 8, 2026", recipient: ["Selection Committee", "Sample Cooperative"], subject: "Reporting Analyst",
  salutation: "Dear Selection Committee,", paragraphs: ["I prepared the monthly SQL reports.", "I reviewed results with colleagues."],
  closing: "Sincerely,", signature: "Morgan Example",
};

function ControlledLetter() {
  const [letter, setLetter] = useState(example);
  return <CoverLetterDocument letter={letter} onChange={setLetter} />;
}

test("uses the supplied letterhead, recipient, subject, paragraphs and signature in order", () => {
  const { container, unmount } = render(<ControlledLetter />);
  const paper = within(container).getByRole("article", { name: "Cover letter document" });
  expect(Array.from(paper.querySelectorAll("h2, li, p")).map(node => node.textContent)).toEqual([
    example.name, ...example.contact, ...example.links, example.date, ...example.recipient, "Re: Reporting Analyst",
    example.salutation, ...example.paragraphs, example.closing, example.signature,
  ]);
  expect(within(paper).getByRole("link", { name: "portfolio.example.test" })).toHaveAttribute("href", "https://portfolio.example.test");
  expect(document.querySelector(".tm-cldoc-print").textContent).toBe(paper.textContent);
  unmount();
  expect(document.querySelector(".tm-cldoc-print")).toBeNull();
});

test("edited paragraphs and a changed role reach both copy and print", async () => {
  const print = jest.spyOn(window, "print").mockImplementation(() => {});
  const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  try {
    render(<ControlledLetter />);
    fireEvent.click(screen.getByRole("button", { name: "Edit letter" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Subject" }), { target: { value: "Data analyst" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Body paragraphs/ }), { target: { value: "First revised paragraph.\n\nSecond revised paragraph." } });
    fireEvent.click(screen.getByRole("button", { name: "Done editing" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Re: Data analyst\n\nDear Selection Committee,\n\nFirst revised paragraph.\n\nSecond revised paragraph.")));
    fireEvent.click(screen.getByRole("button", { name: "Print / Save PDF" }));
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    const output = document.querySelector(".tm-cldoc-print");
    expect(output).toHaveTextContent("Second revised paragraph.");
    expect(output.querySelector("button, textarea")).toBeNull();
  } finally {
    print.mockRestore();
    if (original) Object.defineProperty(navigator, "clipboard", original);
    else delete navigator.clipboard;
  }
});

test("omits unknown details and never creates placeholders", () => {
  const minimal = { paragraphs: ["I am applying to maintain the reporting dashboard."] };
  const { container } = render(<CoverLetterDocument letter={minimal} onChange={() => {}} />);
  expect(coverLetterText(minimal)).toBe(minimal.paragraphs[0]);
  expect(within(container).getByRole("article").textContent).toBe(minimal.paragraphs[0]);
});
