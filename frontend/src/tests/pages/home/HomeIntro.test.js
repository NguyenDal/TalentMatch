import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HomeIntro from "../../../pages/home/HomeIntro";
import MatchWalkthrough from "../../../pages/home/MatchWalkthrough";

jest.mock("react-router-dom", () => {
  global.TextEncoder = require("util").TextEncoder;
  return jest.requireActual("react-router");
}, { virtual: true });

let motionPreference;
let setIntersection;
const originalMatchMedia = window.matchMedia;
const originalObserver = window.IntersectionObserver;

beforeEach(() => {
  jest.useFakeTimers();
  motionPreference = Object.assign(new EventTarget(), { matches: false });
  window.matchMedia = () => motionPreference;
  window.IntersectionObserver = class {
    constructor(callback) {
      setIntersection = isIntersecting => act(() => callback([{ isIntersecting, intersectionRatio: Number(isIntersecting) }]));
    }
    observe() {}
    disconnect() {}
  };
});

afterEach(() => {
  jest.useRealTimers();
  window.matchMedia = originalMatchMedia;
  window.IntersectionObserver = originalObserver;
});

function step(name) {
  return within(screen.getByRole("group", { name: "Walkthrough steps" })).getByRole("button", { name });
}

function tick() {
  act(() => jest.advanceTimersByTime(6000));
}

test("the public intro links to registration and its on-page guide", () => {
  render(<MemoryRouter><HomeIntro /></MemoryRouter>);
  const hero = screen.getByRole("heading", { level: 1 }).closest("section");
  expect(within(hero).getByRole("link", { name: "Find jobs" })).toHaveAttribute("href", "/signup");
  const guide = within(hero).getByRole("link", { name: "How it works" });
  expect(guide).toHaveAttribute("href", "#how-it-works");
  expect(document.getElementById(guide.hash.slice(1))).toBeInTheDocument();
});

test("visible scenes cycle in order, pause, and resume from the current step", () => {
  render(<MatchWalkthrough />);
  setIntersection(true);
  expect(step("Find jobs")).toHaveAttribute("aria-pressed", "true");
  tick();
  expect(step("Check fit")).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "Pause walkthrough" }));
  tick();
  expect(step("Check fit")).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "Play walkthrough" }));
  tick();
  expect(step("Draft")).toHaveAttribute("aria-pressed", "true");
  setIntersection(false);
  tick();
  expect(step("Draft")).toHaveAttribute("aria-pressed", "true");
  setIntersection(true);
  tick();
  expect(step("Find jobs")).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(step("Check fit"));
  tick();
  expect(step("Check fit")).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Play walkthrough" })).toBeVisible();
});

test("reduced motion starts paused and visitors can explore each kind of draft manually", () => {
  motionPreference.matches = true;
  render(<MatchWalkthrough />);
  setIntersection(true);
  tick();
  expect(step("Find jobs")).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Play walkthrough" })).toBeVisible();
  fireEvent.click(step("Draft"));
  const panel = document.getElementById(step("Draft").getAttribute("aria-controls"));
  const resumeText = panel.textContent;
  fireEvent.click(within(panel).getByRole("button", { name: "Cover letter" }));
  const letterText = panel.textContent;
  expect(letterText).not.toBe(resumeText);
  fireEvent.click(within(panel).getByRole("button", { name: "Application answer" }));
  expect(panel.textContent).not.toBe(letterText);
  fireEvent.click(within(panel).getByRole("button", { name: "Résumé" }));
  expect(panel.textContent).toBe(resumeText);
  tick();
  expect(step("Draft")).toHaveAttribute("aria-pressed", "true");
});
