import React, { useEffect, useRef, useState } from "react";
import { FiArrowUpRight } from "react-icons/fi";

export default function JobApplicationAction({ job, applied, onConfirm }) {
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const link = useRef(null);
  const question = useRef(null);

  useEffect(() => {
    if (asking) question.current?.focus();
  }, [asking]);

  async function confirm() {
    setSaving(true);
    setError("");
    try {
      await onConfirm(job);
    } catch {
      setError("We couldn’t save your application. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <div className="tm-job-detail-title"><strong>Job description</strong>
      <a ref={link} className={applied ? "" : "tm-job-apply"} href={job.url} target="_blank" rel="noreferrer"
        onClick={() => { if (!applied) setAsking(true); }}>
        {applied ? "View employer posting" : "Apply"} <FiArrowUpRight aria-hidden="true" />
      </a>
    </div>
    {asking && <div className="tm-job-confirmation" role="group" aria-labelledby={`application-question-${job.board}-${job.id}`}>
      <div>
        <h3 ref={question} tabIndex="-1" id={`application-question-${job.board}-${job.id}`}>Did you apply for this job?</h3>
        <p>Confirm to move this opening to Applied jobs.</p>
      </div>
      <div className="tm-job-confirm-actions">
        <button type="button" disabled={saving} onClick={() => { setAsking(false); setError(""); link.current?.focus(); }}>Not yet</button>
        <button type="button" className="tm-job-confirm-yes" disabled={saving} onClick={confirm}>{saving ? "Saving…" : "Yes, I applied"}</button>
      </div>
      {error && <p role="alert" className="tm-job-error">{error}</p>}
    </div>}
  </>;
}
