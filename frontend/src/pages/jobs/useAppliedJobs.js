import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { BASE_URL, getAuthHeaders } from "../../services/api";

export const jobKey = job => `${job.board}-${job.id}`;

export default function useAppliedJobs() {
  const [jobs, setJobs] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const revision = useRef(0);

  useEffect(() => {
    let request;
    async function load() {
      request?.abort();
      const controller = new AbortController();
      request = controller;
      const started = revision.current;
      setError("");
      try {
        const { data } = await axios.get(`${BASE_URL}/applied-jobs/`, { headers: getAuthHeaders(), signal: controller.signal });
        if (controller.signal.aborted) return;
        if (!Array.isArray(data?.jobs)) throw new Error("Missing applications");
        // A confirmation can finish while an earlier read is in flight.
        if (started === revision.current) setJobs(data.jobs);
        else load();
      } catch {
        if (!controller.signal.aborted) setError("We couldn’t load your application history.");
      }
    }
    load();
    window.addEventListener("focus", load);
    return () => { request?.abort(); window.removeEventListener("focus", load); };
  }, [attempt]);

  async function confirm(job) {
    const { title, location, url } = job;
    const { data } = await axios.put(`${BASE_URL}/applied-jobs/${encodeURIComponent(job.board)}/${job.id}/`,
      { title, location, url }, { headers: getAuthHeaders() });
    revision.current += 1;
    setJobs(current => [data, ...(current || []).filter(item => jobKey(item) !== jobKey(job))]);
  }

  return { jobs, error, confirm, retry: () => setAttempt(n => n + 1) };
}
