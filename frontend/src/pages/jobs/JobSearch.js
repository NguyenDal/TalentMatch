import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { FiArrowUpRight, FiBriefcase, FiChevronDown, FiFileText, FiMapPin, FiSearch, FiX } from "react-icons/fi";
import { useApplicationMaterials } from "../../contexts/ApplicationMaterials";
import { BASE_URL, getAuthHeaders } from "../../services/api";
import { workspaceTools } from "../../app/workspaceRoutes";
import "./JobSearch.css";

const PAGE_SIZE = 10;
const destinations = workspaceTools.filter(item => item.path !== "/jobs");
const errorText = (error, fallback) => typeof error.response?.data?.detail === "string" ? error.response.data.detail : fallback;

function JobListing({ job, expanded, onExpand, onUse }) {
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const panelId = `job-${job.board}-${job.id}`;

  useEffect(() => {
    if (!expanded || description) return;
    const controller = new AbortController();
    setError("");
    axios.get(`${BASE_URL}/job-search/${encodeURIComponent(job.board)}/${job.id}/`, {
      headers: getAuthHeaders(), signal: controller.signal,
    }).then(({ data }) => {
      if (controller.signal.aborted) return;
      if (typeof data.description === "string" && data.description.trim()) setDescription(data.description);
      else setError("This employer did not provide a description. Open the original posting for details.");
    }).catch(err => {
      if (!controller.signal.aborted) setError(errorText(err, "We couldn’t load this posting. Try again or visit the employer."));
    });
    return () => controller.abort();
  }, [expanded, description, job.board, job.id, attempt]);

  return <li className="tm-job-row">
    <button type="button" className="tm-job-summary" aria-expanded={expanded} aria-controls={panelId} onClick={onExpand}>
      <span className="tm-job-company-mark" aria-hidden="true">{job.company.charAt(0)}</span>
      <span className="tm-job-summary-copy"><small>{job.company}</small><strong>{job.title}</strong>
        {job.location && <span className="tm-job-location"><FiMapPin />{job.location}</span>}
      </span>
      <FiChevronDown className={expanded ? "tm-job-expanded" : ""} aria-hidden="true" />
    </button>
    {job.matched_terms?.length > 0 && <p className="tm-job-matches"><span>In your résumé</span> {job.matched_terms.join(" · ")}</p>}
    {expanded && <div id={panelId} className="tm-job-detail">
      <div className="tm-job-detail-title"><strong>Job description</strong>
        <a href={job.url} target="_blank" rel="noreferrer">Employer posting <FiArrowUpRight aria-hidden="true" /></a>
      </div>
      {error ? <p role="alert">{error} <button type="button" onClick={() => setAttempt(n => n + 1)}>Retry</button></p>
        : description ? <>
          <div className="tm-job-description" tabIndex="0" role="region" aria-label={`${job.title} job description`}>{description}</div>
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

  const jobs = jobSearch?.jobs || [];
  const pages = Math.ceil(jobs.length / PAGE_SIZE);
  return <main className="tm-jobs" id="main-content">
    <div className="tm-jobs-body">
      <header className="tm-jobs-heading"><h1>Find <span>jobs.</span></h1>
        <p>Explore openings from Affirm, D2L, and Mozilla. Add your résumé to bring relevant roles to the top.</p>
      </header>
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
      <section className="tm-job-results" aria-labelledby="job-results-title" aria-busy={loading}>
        <header><div><FiBriefcase aria-hidden="true" /><h2 id="job-results-title">Open positions</h2></div><span aria-live="polite">{loading ? "Searching…" : error ? "" : `${jobs.length} ${jobs.length === 1 ? "opening" : "openings"}`}</span></header>
        {error ? <p className="tm-job-error" role="alert">{error} <button type="button" onClick={() => search(resumeFile, keywords, location)}>Retry</button></p>
          : loading ? <p role="status">Checking employer job boards…</p> : <>
            {!!jobSearch?.unavailable_boards?.length && <p role="status">Temporarily unavailable: {jobSearch.unavailable_boards.join(", ")}.</p>}
            {!!jobSearch?.stale_boards?.length && <p role="status">Showing recently cached listings for {jobSearch.stale_boards.join(", ")}.</p>}
            {jobs.length ? <ul className="tm-job-list">{jobs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(job => {
              const key = `${job.board}-${job.id}`;
              return <JobListing key={key} job={job} expanded={expanded === key} onExpand={() => setExpanded(expanded === key ? null : key)} onUse={usePosting} />;
            })}</ul> : <p>{resumeFile
              ? "No openings matched terms in your résumé with these filters. Broaden the search or remove your résumé to browse all openings."
              : "No openings match these filters. Try a broader keyword or location."}</p>}
            {pages > 1 && <nav className="tm-job-pagination" aria-label="Job results pages">
              <button disabled={!page} onClick={() => { setPage(page - 1); setExpanded(null); }}>Previous</button>
              <span>Page {page + 1} of {pages}</span><button disabled={page >= pages - 1} onClick={() => { setPage(page + 1); setExpanded(null); }}>Next</button>
            </nav>}
          </>}
      </section>
    </div>
  </main>;
}
