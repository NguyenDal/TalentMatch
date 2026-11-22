import React, { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import ResumeDocument from "../../../pages/application-tools/ResumeDocument";

const resume = {
  name: "Sample Candidate", contact: ["sam@example.test", "https://example.test"],
  education: [{ school: "Example University", degree: "BA", location: "Toronto", dates: "2020" }],
  experience: [{ title: "Analyst", organization: "Example Team", location: "Toronto", dates: "2021–2024", bullets: ["Wrote SQL reports."] }],
  projects: [], skills: [{ category: "Languages", items: ["SQL", "Python"] }],
};

function EditableResume() {
  const [data, setData] = useState(resume);
  return <ResumeDocument resume={data} onChange={setData} />;
}

test("uses the template order and excludes empty sections and extra controls from the print document", () => {
  const { container, unmount } = render(<ResumeDocument resume={resume} />);
  const paper = within(container).getByRole("article", { name: "Résumé document" });
  expect(within(paper).getAllByRole("heading").map(node => node.textContent))
    .toEqual(["Sample Candidate", "Education", "Experience", "Technical Skills"]);
  expect(within(paper).getByRole("link", { name: "sam@example.test" })).toHaveAttribute("href", "mailto:sam@example.test");
  const output = document.querySelector("body > .tm-rdoc-print");
  expect(output.textContent).toBe(paper.textContent);
  expect(output.querySelector("button,input,textarea")).toBeNull();
  unmount();
  expect(document.querySelector(".tm-rdoc-print")).toBeNull();
});

test("prints the latest edited content, including a newly added project", () => {
  const print = jest.spyOn(window, "print").mockImplementation(() => {});
  try {
    render(<EditableResume />);
    fireEvent.click(screen.getByRole("button", { name: "Edit résumé" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Updated Name" } });
    fireEvent.click(screen.getByRole("button", { name: "Add project" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Project name" }), { target: { value: "Reporting dashboard" } });
    fireEvent.change(within(screen.getByRole("group", { name: "project 1" })).getByRole("textbox", { name: /Achievements/ }),
      { target: { value: "Analyzed sample data.\nPublished the charts." } });
    fireEvent.click(screen.getByRole("button", { name: "Done editing" }));
    fireEvent.click(screen.getByRole("button", { name: "Print / Save PDF" }));
    expect(print).toHaveBeenCalledTimes(1);
    const output = document.querySelector("body > .tm-rdoc-print");
    expect(output).toHaveTextContent("Updated Name");
    expect(output).toHaveTextContent("Reporting dashboard");
    expect(output.querySelectorAll("li")).toHaveLength(5);
  } finally {
    print.mockRestore();
  }
});

test("cancel restores the original draft after removing experience", () => {
  render(<EditableResume />);
  fireEvent.click(screen.getByRole("button", { name: "Edit résumé" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove position 1" }));
  expect(document.querySelector(".tm-rdoc-print")).not.toHaveTextContent("Example Team");
  fireEvent.click(screen.getByRole("button", { name: "Cancel edits" }));
  expect(document.querySelector(".tm-rdoc-print")).toHaveTextContent("Example Team");
});
