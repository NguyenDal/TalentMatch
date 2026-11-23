import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { FiArrowUpRight, FiBriefcase, FiChevronDown, FiFileText, FiMapPin, FiSearch, FiX } from "react-icons/fi";
import { useApplicationMaterials } from "../../contexts/ApplicationMaterials";
import { BASE_URL, getAuthHeaders } from "../../services/api";
import { workspaceTools } from "../../app/workspaceRoutes";
import JobApplicationAction from "./JobApplicationAction";
import useAppliedJobs, { jobKey } from "./useAppliedJobs";
import JobDescription from "./JobDescription";
import affirmLogo from "../../assets/employers/affirm.png";
import d2lLogo from "../../assets/employers/d2l.svg";
import mozillaLogo from "../../assets/employers/mozilla.png";
import "./JobSearch.css";

const PAGE_SIZE = 10;
const employerLogos = { affirm: affirmLogo, d2l: d2lLogo, mozilla: mozillaLogo };
const destinations = workspaceTools.filter(item => item.path !== "/jobs");
const errorText = (error, fallback) => typeof error.response?.data?.detail === "string" ? error.response.data.detail : fallback;

function JobListSkeleton() {
  return <ul className="tm-job-list tm-job-skeleton" aria-hidden="true">
    {Array.from({ length: 5 }, (_, index) => <li key={index} className="tm-job-row">
      <span className="tm-job-skeleton-mark" />
      <span className="tm-job-skeleton-copy">
        <span className="tm-job-skeleton-company" />
        <span className="tm-job-skeleton-title" />
        <span className="tm-job-skeleton-location" />
      </span>
    </li>)}
  </ul>;
}

function JobListing({ job, expanded, onExpand, onUse, applied, onConfirm }) {
  const [description, setDescription] = useState("");
  const [sections, setSections] = useState([]);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const panelId = `job-${job.board}-${job.id}`;
  const logo = employerLogos[job.board];

  useEffect(() => {
    if (!expanded || description) return;
    const controller = new AbortController();
    setError("");
    axios.get(`${BASE_URL}/job-search/${encodeURIComponent(job.board)}/${job.id}/`, {
      headers: getAuthHeaders(), signal: controller.signal,
    }).then(({ data }) => {
      if (controller.signal.aborted) return;
      if (typeof data.description === "string" && data.description.trim()) {
        setDescription(data.description);
        setSections(data.description_sections || []);
      } else setError("This employer did not provide a description. Open the original posting for details.");
    }).catch(err => {
      if (!controller.signal.aborted) setError(errorText(err, "We couldn’t load this posting. Try again or visit the employer."));
    });
    return () => controller.abort();
  }, [expanded, description, job.board, job.id, attempt]);

  return <li className="tm-job-row">
    <button type="button" className="tm-job-summary" aria-expanded={expanded} aria-controls={panelId} onClick={onExpand}>
      <span className="tm-job-company-mark" aria-hidden="true">
        {logo ? <img src={logo} alt="" /> : job.company.charAt(0)}
      </span>
      <span className="tm-job-summary-copy"><small>{job.company}</small><strong>{job.title}</strong>
        {job.location && <span className="tm-job-location"><FiMapPin />{job.location}</span>}
      </span>
      <FiChevronDown className={expanded ? "tm-job-expanded" : ""} aria-hidden="true" />
    </button>
    {job.matched_terms?.length > 0 && <p className="tm-job-matches"><span>In your résumé</span> {job.matched_terms.join(" · ")}</p>}
    {expanded && <div id={panelId} className="tm-job-detail">
      <JobApplicationAction job={job} applied={applied} onConfirm={onConfirm} />
      {error ? <p role="alert">{error} <button type="button" onClick={() => setAttempt(n => n + 1)}>Retry</button></p>
        : description ? <>
          <JobDescription title={job.title} description={description} sections={sections} />
          <div className="tm-job-destinations" aria-label="Use this posting">
            {destinations.map(item => <button type="button" key={item.path} onClick={() => onUse(item.path, job, description)}>{item.label}<FiArrowUpRight aria-hidden="true" /></button>)}
          </div>
        </> : <p role="status">Loading description…</p>}
    </div>}
  </li>;
}

export default function JobSearch() {
  const { resumeFile, setResumeFile, setJobDesc, jobSearch, setJobSearch } = useApplicationMaterials();
  const [keywords, setKeywords] = useState(jobSearch?.keywords || "");
  const [location, setLocation] = useState(jobSearch?.location || "");
  const [loading, setLoading] = useState(!jobSearch);
  const [error, setError] = useState("");
  const [fileError, setFileError] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [page, setPage] = useState(0);
  const [showApplied, setShowApplied] = useState(false);
  const [notice, setNotice] = useState("");
  const applications = useAppliedJobs();
  const resultsTitle = useRef(null);
  const request = useRef(null);
  const picker = useRef(null);
  const navigate = useNavigate();

  async function search(file, words, place) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    setExpanded(null);
    setPage(0);
    const form = new FormData();
    if (file) form.append("resume", file);
    form.append("keywords", words.trim());
    form.append("location", place.trim());
    try {
      const { data } = await axios.post(`${BASE_URL}/job-search/`, form, { headers: getAuthHeaders(), signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!Array.isArray(data?.jobs)) throw new Error("Missing jobs");
      setJobSearch({ ...data, keywords: words, location: place });
    } catch (err) {
      if (!controller.signal.aborted) setError(errorText(err, "The job boards could not be reached. Try your search again."));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  // Reuse this tab's last search when returning from an application tool.
  useEffect(() => {
    if (!jobSearch) search(resumeFile, keywords, location);
    return () => request.current?.abort();
    // The search button and file picker handle changes after the initial visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function chooseFile(file) {
    if (file && (!/\.(pdf|docx|txt)$/i.test(file.name) || !file.size || file.size > 5 * 1024 * 1024)) {
      setFileError("Choose a nonempty PDF, DOCX, or TXT résumé of 5 MB or less.");
      return;
    }
    setFileError("");
    setResumeFile(file);
    search(file, keywords, location);
  }

  function usePosting(path, job, description) {
    setJobDesc([`${job.title} — ${job.company}`, job.location, description].filter(Boolean).join("\n\n"));
    navigate(path);
  }

  function selectView(applied) {
    setShowApplied(applied);
    setExpanded(null);
    setNotice("");
    setPage(0);
  }

  async function confirm(job) {
    await applications.confirm(job);
    setNotice(`${job.title} moved to Applied jobs.`);
    resultsTitle.current?.focus();
  }

  const appliedJobs = applications.jobs || [];
  const appliedKeys = new Set(appliedJobs.map(jobKey));
  const openings = jobSearch?.jobs || [];
  const jobs = showApplied ? appliedJobs : openings.filter(job => !appliedKeys.has(jobKey(job)));
  const historyMissing = applications.jobs === null;
  const historyError = historyMissing && applications.error;
  const resultsError = historyError || (!showApplied && error);
  const busy = !resultsError && (historyMissing || (!showApplied && loading));
  const pages = Math.ceil(jobs.length / PAGE_SIZE);
  const currentPage = Math.min(page, Math.max(0, pages - 1));
  const countLabel = showApplied ? "application" : "opening";
  const totalLabel = `${jobs.length} ${countLabel}${jobs.length === 1 ? "" : "s"}`;
  let emptyMessage = "No openings match these filters. Try a broader keyword or location.";
  if (showApplied) emptyMessage = "Your confirmed applications will appear here.";
  else if (openings.length) emptyMessage = "You’ve applied to every opening in these results.";
  else if (resumeFile) emptyMessage = "No openings matched terms in your résumé with these filters. Broaden the search or remove your résumé to browse all openings.";
  return <main className="tm-jobs" id="main-content">
    <div className="tm-jobs-body">
      <header className="tm-jobs-heading"><h1>Find <span>jobs.</span></h1>
        <p>Explore openings from Affirm, D2L, and Mozilla. Add your résumé to bring relevant roles to the top.</p>
      </header>
      <div className="tm-job-views" role="group" aria-label="Job lists">
        <button type="button" aria-pressed={!showApplied} onClick={() => selectView(false)}>Browse openings</button>
        <button type="button" aria-pressed={showApplied} onClick={() => selectView(true)}>Applied jobs</button>
      </div>
      {!showApplied && <>
      <form className="tm-job-filters" aria-label="Search jobs" onSubmit={e => { e.preventDefault(); search(resumeFile, keywords, location); }}>
        <label>Role or keyword<span><FiSearch aria-hidden="true" /><input maxLength={120} value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="e.g. Software engineer" /></span></label>
        <label>Location<span><FiMapPin aria-hidden="true" /><input maxLength={120} value={location} onChange={e => setLocation(e.target.value)} placeholder="City, country, or remote" /></span></label>
        <button type="submit" className="tm-job-primary" disabled={loading}><FiSearch aria-hidden="true" />Search jobs</button>
      </form>
      <div className="tm-job-material">
        <input ref={picker} type="file" aria-label="Upload a résumé for job search" accept=".pdf,.docx,.txt" hidden
          onChange={e => { if (e.target.files[0]) chooseFile(e.target.files[0]); e.target.value = ""; }} />
        <FiFileText aria-hidden="true" /><div><strong>{resumeFile ? resumeFile.name : "Rank openings with your résumé"}</strong>
          <small>{resumeFile ? "Ranked by shared skills and role terms." : "PDF, DOCX, or TXT · Up to 5 MB"}</small></div>
        <button type="button" onClick={() => picker.current?.click()}>{resumeFile ? "Change résumé" : "Add résumé"}</button>
        {resumeFile && <button type="button" aria-label="Remove résumé" onClick={() => chooseFile(null)}><FiX aria-hidden="true" /></button>}
      </div>
      {fileError && <p role="alert" className="tm-job-error">{fileError}</p>}
      </>}
      <section className="tm-job-results" aria-labelledby="job-results-title" aria-busy={busy}>
        <header><div><FiBriefcase aria-hidden="true" /><h2 ref={resultsTitle} tabIndex="-1" id="job-results-title">{showApplied ? "Applied jobs" : "Open positions"}</h2></div>
          <span aria-live="polite">{busy ? (showApplied ? "Loading…" : "Searching…") : !resultsError && totalLabel}</span></header>
        {notice && <p role="status" className="tm-job-saved">{notice}</p>}
        {!historyMissing && applications.error && <p className="tm-job-error" role="status">We couldn’t refresh your application history. <button type="button" onClick={applications.retry}>Retry</button></p>}
        {resultsError ? <p className="tm-job-error" role="alert">{resultsError} <button type="button" onClick={historyError ? applications.retry : () => search(resumeFile, keywords, location)}>Retry</button></p>
          : busy ? <JobListSkeleton /> : <>
            {!showApplied && !!jobSearch?.unavailable_boards?.length && <p role="status">Temporarily unavailable: {jobSearch.unavailable_boards.join(", ")}.</p>}
            {!showApplied && !!jobSearch?.stale_boards?.length && <p role="status">Showing recently cached listings for {jobSearch.stale_boards.join(", ")}.</p>}
            {jobs.length ? <ul className="tm-job-list">{jobs.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map(job => {
              const key = jobKey(job);
              return <JobListing key={key} job={job} expanded={expanded === key} onExpand={() => setExpanded(expanded === key ? null : key)}
                applied={showApplied} onConfirm={confirm} onUse={usePosting} />;
            })}</ul> : <p>{emptyMessage}</p>}
            {pages > 1 && <nav className="tm-job-pagination" aria-label="Job results pages">
              <button disabled={!currentPage} onClick={() => { setPage(currentPage - 1); setExpanded(null); }}>Previous</button>
              <span>Page {currentPage + 1} of {pages}</span><button disabled={currentPage >= pages - 1} onClick={() => { setPage(currentPage + 1); setExpanded(null); }}>Next</button>
            </nav>}
          </>}
      </section>
    </div>
  </main>;
}
