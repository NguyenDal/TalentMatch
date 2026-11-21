import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { BASE_URL } from "../services/api";

const USERNAME_RULES = "Use 3–30 letters, numbers, or underscores.";

export default function useUsernameAvailability(username) {
  const [result, setResult] = useState(null);
  const generation = useRef(0);
  const valid = /^[A-Za-z0-9_]{3,30}$/.test(username);

  useEffect(() => {
    const requestId = ++generation.current;
    setResult(null);
    if (!valid) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const { data } = await axios.get(`${BASE_URL}/auth/username-availability/`, {
          params: { username },
          signal: controller.signal,
        });
        if (controller.signal.aborted || requestId !== generation.current) return;
        const available = data.valid === true && data.available === true;
        setResult({ username, status: available ? "available" : "unavailable",
          message: data.message || (available ? "This username is available." : "This username is already taken.") });
      } catch (error) {
        if (controller.signal.aborted || requestId !== generation.current) return;
        setResult({ username, status: "error", message: "We couldn’t check this username. Try changing it or check your connection." });
      }
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [username, valid]);

  if (!username) return { status: "idle", message: USERNAME_RULES, available: false };
  if (!valid) return { status: "invalid", message: USERNAME_RULES, available: false };
  if (!result || result.username !== username) return { status: "checking", message: "Checking availability…", available: false };
  return { ...result, available: result.status === "available" };
}
