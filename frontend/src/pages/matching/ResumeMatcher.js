import React, { useRef, useState } from "react";
import axios from "axios";
import { FiAlertCircle, FiArrowRight, FiArrowUpRight, FiBriefcase, FiCheck, FiCheckCircle, FiChevronDown, FiFileText, FiLoader, FiMessageSquare, FiPlus, FiTarget, FiUploadCloud, FiX } from "react-icons/fi";
import { BASE_URL, getAuthHeaders } from "../../services/api";
import "./ResumeMatcher.css";

const fileSize = (bytes) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
const failedAnalysisMessage = "The matching service is unavailable. Please try again later.";
const emptyAnalysisMessage = "No requirements were returned for this analysis, so a match score couldn’t be calculated. Please try again.";
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isNonemptyString = (value) => typeof value === "string" && value.trim().length > 0;
const isErrorLabel = (value) => typeof value === "string" && /^(error|ai extraction error)$/i.test(value.trim());
const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const MAX_JOB_CHARACTERS = 30000;

function matchResultError(data) {
  // Older servers encoded exceptions inside an otherwise successful response.
  // Never render their raw exception text as application Q&A.
  if (!isRecord(data) || data.error || data.detail ||
    !Array.isArray(data.met_requirements) || !Array.isArray(data.missing_requirements)) return failedAnalysisMessage;
  const requirements = [...data.met_requirements, ...data.missing_requirements];
  if (requirements.some((item) => !isNonemptyString(item) || isErrorLabel(item)) ||
    data.met_requirements.some((item) => data.missing_requirements.includes(item))) return failedAnalysisMessage;
  if (data.ai_suggestions !== undefined && (!Array.isArray(data.ai_suggestions) ||
    data.ai_suggestions.some((item) => !isRecord(item) || !isNonemptyString(item.question) ||
      !isNonemptyString(item.answer) || isErrorLabel(item.question)))) return failedAnalysisMessage;
  if (data.requirement_explanations != null && (!isRecord(data.requirement_explanations) ||
    Object.values(data.requirement_explanations).some((item) => typeof item !== "string"))) return failedAnalysisMessage;
  return requirements.length ? "" : emptyAnalysisMessage;
}

export default function ResumeMatcher() {
  const fileInput = useRef(null);
  const [resumeFile, setResumeFile] = useState(null);
  const [jobDesc, setJobDesc] = useState("");
  const [rawResult, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fileError, setFileError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [expandedReq, setExpandedReq] = useState(null);
  const [userMet, setUserMet] = useState([]);
  const [userMissing, setUserMissing] = useState([]);
  // Also validate results already in state after a frontend update.
  const resultError = rawResult ? matchResultError(rawResult) : "";
  const result = resultError ? null : rawResult;
  const displayedError = error || resultError;

  const originalMet = [...new Set(result?.met_requirements || [])];
  const originalMissing = [...new Set(result?.missing_requirements || [])];
  const effectiveMet = [...new Set([...originalMet, ...userMet])].filter(req => !userMissing.includes(req));
  const effectiveMissing = [...new Set([...originalMissing, ...userMissing])].filter(req => !userMet.includes(req));
  const requirementsTotal = new Set([...originalMet, ...originalMissing]).size;
  const score = requirementsTotal ? Math.round((effectiveMet.length / requirementsTotal) * 1000) / 10 : 0;
  const jobError = jobDesc.length > MAX_JOB_CHARACTERS ? "Please shorten the job description to 30,000 characters or fewer." : "";
  const ready = Boolean(resumeFile && jobDesc.trim() && !jobError);
  const wordCount = jobDesc.trim() ? jobDesc.trim().split(/\s+/).length : 0;

  const clearResult = () => {
    setResult(null);
    setError("");
    setUserMet([]);
    setUserMissing([]);
    setExpandedReq(null);
  };

  const chooseFile = (files) => {
    if (loading || !files?.length) return;
    if (files.length !== 1) {
      setFileError("Choose one resume at a time.");
      return;
    }
    const file = files[0];
    if (!/\.(pdf|docx|txt)$/i.test(file.name)) {
      setFileError("Please choose a PDF, DOCX, or TXT file.");
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    if (file.size > MAX_RESUME_BYTES) {
      setFileError("Please choose a resume of 5 MB or smaller.");
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    setResumeFile(file);
    setFileError("");
    clearResult();
  };

  const removeFile = () => {
    setResumeFile(null);
    setFileError("");
    if (fileInput.current) fileInput.current.value = "";
    clearResult();
    fileInput.current?.focus();
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!ready || loading) return;
    setLoading(true);
    clearResult();
    const formData = new FormData();
    formData.append("resume", resumeFile);
    formData.append("job_description", jobDesc);
    try {
      const { data } = await axios.post(`${BASE_URL}/upload-resume/`, formData, {
        headers: { ...getAuthHeaders(), "Content-Type": "multipart/form-data" },
      });
      const responseError = matchResultError(data);
      if (responseError) setError(responseError);
      else setResult(data);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "We couldn’t complete this match. Please try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  const requirement = (req, isMet, index) => {
    const key = `${isMet ? "met" : "gap"}-${index}`;
    const expanded = expandedReq === key;
    return <li className={`tm-workspace-requirement ${isMet ? "is-met" : "is-gap"}`} key={req}>
      <button type="button" className="tm-workspace-requirement-toggle" aria-expanded={expanded}
        aria-controls={`requirement-${key}`} onClick={() => setExpandedReq(expanded ? null : key)}>
        <span className="tm-workspace-requirement-status" aria-hidden="true">{isMet ? <FiCheck /> : <FiPlus />}</span>
        <span>{req}</span><FiChevronDown className={expanded ? "is-expanded" : ""} aria-hidden="true" />
      </button>
      {expanded && <div className="tm-workspace-requirement-detail" id={`requirement-${key}`}>
        <p>{result.requirement_explanations?.[req] || "No additional explanation was returned for this requirement."}</p>
        <span className="tm-workspace-detail-label">Does this reflect your experience?</span>
        <div className="tm-workspace-requirement-actions">
          <button type="button" onClick={() => {
            setUserMet(prev => [...new Set([...prev, req])]);
            setUserMissing(prev => prev.filter(item => item !== req));
            setExpandedReq(null);
          }}><FiCheck aria-hidden="true" /> Yes, I meet this</button>
          <button type="button" onClick={() => {
            setUserMissing(prev => [...new Set([...prev, req])]);
            setUserMet(prev => prev.filter(item => item !== req));
            setExpandedReq(null);
          }}>Not yet</button>
        </div>
      </div>}
    </li>;
  };

  return <main className="tm-workspace" id="main-content">
    <div className="tm-workspace-container">
      <header className="tm-workspace-heading">
        <div>
          <p className="tm-workspace-eyebrow"><span /> YOUR NEXT MOVE STARTS HERE</p>
          <h1>Find where you <span>fit.</span></h1>
          <p className="tm-workspace-description">Your experience. A new opportunity. Let’s see how they connect.</p>
        </div>
        <div className="tm-workspace-heading-note"><FiTarget aria-hidden="true" /><span>A little clarity.<br /><strong>A more confident next step.</strong></span></div>
      </header>

      <ol className="tm-workspace-steps" aria-label="Match progress">
        <li className={resumeFile ? "is-complete" : "is-current"} aria-current={!resumeFile ? "step" : undefined}>
          <span className="tm-workspace-step-number">{resumeFile ? <FiCheck aria-hidden="true" /> : "01"}</span>
          <span>Your resume</span><span className="tm-workspace-step-line" />
        </li>
        <li className={jobDesc.trim() ? "is-complete" : resumeFile ? "is-current" : ""} aria-current={resumeFile && !jobDesc.trim() ? "step" : undefined}>
          <span className="tm-workspace-step-number">{jobDesc.trim() ? <FiCheck aria-hidden="true" /> : "02"}</span>
          <span>The opportunity</span><span className="tm-workspace-step-line" />
        </li>
        <li className={result ? "is-complete" : ready ? "is-current" : ""} aria-current={ready && !result ? "step" : undefined}>
          <span className="tm-workspace-step-number">{result ? <FiCheck aria-hidden="true" /> : "03"}</span><span>Your match</span>
        </li>
      </ol>

      <form onSubmit={submit} className="tm-workspace-form" aria-busy={loading}>
        <div className="tm-workspace-inputs">
          <section className="tm-workspace-card tm-workspace-resume" aria-labelledby="workspace-resume-title">
            <div className="tm-workspace-card-heading">
              <span className="tm-workspace-card-icon"><FiFileText aria-hidden="true" /></span>
              <div><h2 id="workspace-resume-title">Bring your experience.</h2><p>Start with your latest resume.</p></div>
              {resumeFile && <FiCheckCircle className="tm-workspace-ready-icon" aria-label="Resume selected" />}
            </div>
            <div className={`tm-workspace-dropzone${dragging ? " is-dragging" : ""}${resumeFile ? " has-file" : ""}`}
              onDragOver={(event) => { event.preventDefault(); if (!loading) setDragging(true); }}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); }}
              onDrop={(event) => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files); }}>
              <input ref={fileInput} type="file" id="workspace-resume" accept=".pdf,.docx,.txt" disabled={loading}
                aria-label={resumeFile ? "Replace resume" : "Upload your resume"}
                aria-describedby={fileError ? "workspace-file-error" : resumeFile ? undefined : "workspace-file-types"}
                aria-invalid={fileError ? true : undefined} onChange={(event) => chooseFile(event.target.files)} />
              <span className="tm-workspace-upload-icon">{resumeFile ? <FiFileText aria-hidden="true" /> : <FiUploadCloud aria-hidden="true" />}</span>
              {resumeFile ? <>
                <strong className="tm-workspace-file-name">{resumeFile.name}</strong>
                <span>{fileSize(resumeFile.size)} <span aria-hidden="true">·</span> Ready to match</span>
                <span className="tm-workspace-upload-link">Choose a different file <FiArrowRight aria-hidden="true" /></span>
              </> : <>
                <strong>Drop your resume here</strong>
                <span>or <span className="tm-workspace-upload-link">browse files <FiArrowUpRight aria-hidden="true" /></span></span>
                <span id="workspace-file-types" className="tm-workspace-file-types">PDF, DOCX, or TXT · Up to 5 MB</span>
              </>}
            </div>
            {resumeFile && <button type="button" className="tm-workspace-remove" onClick={removeFile} disabled={loading}><FiX aria-hidden="true" /> Remove file</button>}
            {fileError && <p id="workspace-file-error" role="alert" className="tm-workspace-field-error"><FiAlertCircle aria-hidden="true" /> {fileError}</p>}
            <div className="tm-workspace-tip"><span className="tm-workspace-tip-spark" aria-hidden="true">✦</span><p><strong>Make your experience count.</strong> Include the skills, projects, and achievements you want to bring to your next role.</p></div>
          </section>

          <section className="tm-workspace-card tm-workspace-job" aria-labelledby="workspace-job-title">
            <div className="tm-workspace-card-heading">
              <span className="tm-workspace-card-icon"><FiBriefcase aria-hidden="true" /></span>
              <div><h2 id="workspace-job-title">Meet the opportunity.</h2><p>Paste the role you have in mind.</p></div>
            </div>
            <label className="tm-workspace-field-label" htmlFor="workspace-job-description">Job description</label>
            <textarea id="workspace-job-description" value={jobDesc} disabled={loading} required
              aria-invalid={jobError ? true : undefined} aria-describedby={jobError ? "workspace-job-error" : undefined}
              onChange={(event) => { setJobDesc(event.target.value); clearResult(); }}
              placeholder={"Paste the full job description here…\n\nInclude the responsibilities, required skills, and qualifications for a clearer match."} />
            {jobError && <p id="workspace-job-error" role="alert" className="tm-workspace-field-error"><FiAlertCircle aria-hidden="true" /> {jobError}</p>}
            <div className="tm-workspace-job-meta"><span>The full posting gives you more context.</span><span>{wordCount} {wordCount === 1 ? "word" : "words"}</span></div>
          </section>
        </div>

        <div className="tm-workspace-action-bar">
          <p className={ready ? "is-ready" : ""} aria-live="polite">
            {loading ? <><FiLoader className="tm-workspace-spin" aria-hidden="true" /><span>Reading your resume and comparing the role…</span></>
              : ready ? <><FiCheckCircle aria-hidden="true" /><span>All set. Let’s connect the dots.</span></>
              : <><FiFileText aria-hidden="true" /><span>{!resumeFile ? "Add your resume" : "Resume added"}<span className="tm-workspace-action-dot">·</span>{jobDesc.trim() ? "Job description added" : "Paste a job description"}</span></>}
          </p>
          <button type="submit" className="tm-workspace-submit" disabled={!ready || loading}>
            {loading ? "Finding your match…" : result ? "Check match again" : "Find my match"}<FiArrowUpRight aria-hidden="true" />
          </button>
        </div>
        {displayedError && <p role="alert" className="tm-workspace-error"><FiAlertCircle aria-hidden="true" /> {displayedError}</p>}
      </form>

      {!result && <section className="tm-workspace-outcomes" aria-label="What your match includes">
        <p className="tm-workspace-outcome-intro">A clearer picture<br /><strong>of what comes next.</strong></p>
        <div><FiTarget aria-hidden="true" /><span><strong>Understand your fit</strong><small>See how your experience aligns.</small></span></div>
        <div><FiCheckCircle aria-hidden="true" /><span><strong>Find your strengths</strong><small>Spot the matches and the gaps.</small></span></div>
        <div><FiMessageSquare aria-hidden="true" /><span><strong>Prepare with purpose</strong><small>Explore tailored application Q&amp;A.</small></span></div>
      </section>}

      {result && <section className="tm-workspace-results" aria-labelledby="workspace-results-title" aria-live="polite">
        <div className="tm-workspace-results-heading"><div><p className="tm-workspace-eyebrow">YOUR MATCH OVERVIEW</p><h2 id="workspace-results-title">See the connection.</h2></div><span className="tm-workspace-results-file"><FiFileText aria-hidden="true" />{resumeFile?.name}</span></div>
        <div className="tm-workspace-score-card">
          <div className="tm-workspace-score-ring" style={{ "--match-progress": `${score}%` }} aria-label={requirementsTotal ? `${score}% match` : "No requirements identified"}>
            <span><strong>{requirementsTotal ? score : "—"}{requirementsTotal > 0 && <small>%</small>}</strong><em>MATCH</em></span>
          </div>
          <div className="tm-workspace-score-copy"><h3>Your experience, in perspective.</h3><p><strong>{effectiveMet.length} of {requirementsTotal} requirements</strong> align with your experience. Explore each one below to see the reasoning and adjust anything that needs context.</p>{(userMet.length > 0 || userMissing.length > 0) && <span className="tm-workspace-adjusted">Includes your adjustments</span>}</div>
          <div className="tm-workspace-score-stats"><span><strong>{effectiveMet.length}</strong> strengths</span><span><strong>{effectiveMissing.length}</strong> to explore</span></div>
        </div>

        <div className="tm-workspace-requirements-grid">
          <section className="tm-workspace-card" aria-labelledby="workspace-strengths"><h3 className="tm-workspace-list-heading" id="workspace-strengths"><FiCheckCircle aria-hidden="true" /> Your strengths <span>{effectiveMet.length}</span></h3><p className="tm-workspace-list-note">Experience that connects with the role.</p><ul>{effectiveMet.map((req, index) => requirement(req, true, index))}</ul>{!effectiveMet.length && <p className="tm-workspace-empty">No matching requirements identified yet. Review the areas to explore for more context.</p>}</section>
          <section className="tm-workspace-card" aria-labelledby="workspace-gaps"><h3 className="tm-workspace-list-heading" id="workspace-gaps"><FiTarget aria-hidden="true" /> Areas to explore <span>{effectiveMissing.length}</span></h3><p className="tm-workspace-list-note">Opportunities to add context or build experience.</p><ul>{effectiveMissing.map((req, index) => requirement(req, false, index))}</ul>{!effectiveMissing.length && <p className="tm-workspace-empty">No missing requirements identified in this match.</p>}</section>
        </div>

        {Array.isArray(result.ai_suggestions) && result.ai_suggestions.length > 0 && <section className="tm-workspace-card tm-workspace-questions" aria-labelledby="workspace-questions-title">
          <div className="tm-workspace-card-heading"><span className="tm-workspace-card-icon"><FiMessageSquare aria-hidden="true" /></span><div><h2 id="workspace-questions-title">Turn insight into your next step.</h2><p>Application questions, with your experience in mind.</p></div></div>
          {result.ai_suggestions.map((item, index) => <div className="tm-workspace-question" key={index}><button type="button" aria-expanded={expandedReq === `qa-${index}`} aria-controls={`workspace-answer-${index}`} onClick={() => setExpandedReq(expandedReq === `qa-${index}` ? null : `qa-${index}`)}><span>{item.question}</span><FiChevronDown className={expandedReq === `qa-${index}` ? "is-expanded" : ""} aria-hidden="true" /></button>{expandedReq === `qa-${index}` && <p id={`workspace-answer-${index}`}>{item.answer}</p>}</div>)}
        </section>}
        <p className="tm-workspace-results-note">A starting point for reflection. Your experience is more than a match score.</p>
      </section>}
    </div>
  </main>;
}
