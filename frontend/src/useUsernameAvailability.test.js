import { act, renderHook } from "@testing-library/react";
import axios from "axios";
import useUsernameAvailability from "./useUsernameAvailability";

jest.mock("axios", () => ({ get: jest.fn() }));

beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
afterEach(() => jest.useRealTimers());

test("debounces typing and rejects invalid usernames before making requests", async () => {
  axios.get.mockResolvedValue({ data: { available: true, valid: true } });
  const { result, rerender } = renderHook(({ username }) => useUsernameAvailability(username), { initialProps: { username: "a" } });
  expect(result.current.status).toBe("invalid");
  rerender({ username: "alpha" });
  act(() => jest.advanceTimersByTime(200));
  rerender({ username: "alpha_one" });
  expect(result.current.status).toBe("checking");
  await act(async () => jest.advanceTimersByTime(350));
  expect(axios.get).toHaveBeenCalledTimes(1);
  expect(axios.get.mock.calls[0][1].params).toEqual({ username: "alpha_one" });
  expect(result.current.available).toBe(true);
});

test("an older available response cannot override a newer taken username", async () => {
  let resolveOld;
  let resolveNew;
  axios.get.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
    .mockImplementationOnce(() => new Promise(resolve => { resolveNew = resolve; }));
  const { result, rerender } = renderHook(({ username }) => useUsernameAvailability(username), { initialProps: { username: "old_name" } });
  act(() => jest.advanceTimersByTime(350));
  rerender({ username: "taken_name" });
  expect(result.current.available).toBe(false);
  act(() => jest.advanceTimersByTime(350));
  await act(async () => resolveNew({ data: { available: false, valid: true, message: "Already taken." } }));
  await act(async () => resolveOld({ data: { available: true, valid: true } }));
  expect(result.current.status).toBe("unavailable");
  expect(result.current.message).toBe("Already taken.");
  expect(result.current.available).toBe(false);
});

test("returning to a previously checked username starts a fresh availability check", async () => {
  axios.get.mockResolvedValueOnce({ data: { available: true, valid: true } });
  const { result, rerender } = renderHook(({ username }) => useUsernameAvailability(username), { initialProps: { username: "first_name" } });
  await act(async () => jest.advanceTimersByTime(350));
  expect(result.current.available).toBe(true);
  rerender({ username: "second_name" });
  rerender({ username: "first_name" });
  expect(result.current.status).toBe("checking");
  expect(result.current.available).toBe(false);
});
