import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider, useTheme } from "../../contexts/ThemeContext";

function ThemeControl() {
  const { theme, toggleTheme } = useTheme();
  return <button onClick={toggleTheme}>{theme}</button>;
}

let themeMeta;
beforeEach(() => {
  localStorage.clear();
  themeMeta = document.createElement("meta");
  themeMeta.name = "theme-color";
  themeMeta.content = "#7152e8";
  document.head.appendChild(themeMeta);
});
afterEach(() => {
  themeMeta.remove();
  document.documentElement.classList.remove("dark");
  document.documentElement.style.removeProperty("--tm-dark-bg");
  localStorage.clear();
});

test("stored dark appearance updates the browser toolbar and toggle restores the light color", () => {
  localStorage.setItem("theme", "dark");
  render(<ThemeProvider><ThemeControl /></ThemeProvider>);
  expect(document.documentElement).toHaveClass("dark");
  expect(themeMeta).toHaveAttribute("content", "#212121");

  fireEvent.click(screen.getByRole("button", { name: "dark" }));
  expect(document.documentElement).not.toHaveClass("dark");
  expect(themeMeta).toHaveAttribute("content", "#7152e8");
  expect(localStorage.getItem("theme")).toBe("light");
});

test("the browser toolbar uses the same dark background token as the page", () => {
  localStorage.setItem("theme", "dark");
  document.documentElement.style.setProperty("--tm-dark-bg", "#242424");
  render(<ThemeProvider><ThemeControl /></ThemeProvider>);
  expect(themeMeta).toHaveAttribute("content", "#242424");
});
