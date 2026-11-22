import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { FiArrowRight, FiCheck, FiCopy, FiFileText, FiLoader, FiMail, FiMessageSquare, FiUploadCloud, FiX } from "react-icons/fi";
import { useApplicationMaterials } from "../../contexts/ApplicationMaterials";
import { BASE_URL, getAuthHeaders } from "../../services/api";
import ResumeDocument from "./ResumeDocument";
import CoverLetterDocument from "./CoverLetterDocument";
import "./ApplicationToolPage.css";

const tools = {
  resume: {
    title: "Resume builder", icon: FiFileText, action: "Build resume", result: "Resume preview",
    intro: "Tailor your experience to the role in Jake’s single-column resume format.",
    empty: "Your tailored resume will appear here for editing and PDF export.",
  },
  "cover-letter": {
    title: "Cover letter", icon: FiMail, action: "Draft cover letter", result: "Letter draft",
    intro: "Build a letter around relevant projects and experience from your resume.",
    empty: "Generate a letter to edit, copy, or save as a PDF.",
  },
  question: {
    title: "Application questions", icon: FiMessageSquare, action: "Draft answer", result: "Answer draft",
    intro: "Answer an application question using your experience and the requirements of the role.",
    empty: "Your answer will appear here for editing and copying into the application.",
  },
};

const MAX_JOB_LENGTH = 30000;
const MAX_QUESTION_LENGTH = 2000;
const isText = value => typeof value === "string";
const isTextList = value => Array.isArray(value) && value.every(isText);
const hasFields = (entry, fields) => entry && fields.every(field => isText(entry[field]));

function validResume(resume) {
  if (!resume || !isText(resume.name) || !isTextList(resume.contact)) return false;
  return Array.isArray(resume.education) && resume.education.every(row => hasFields(row, ["school", "degree", "location", "dates"])) &&
    Array.isArray(resume.experience) && resume.experience.every(row => hasFields(row, ["title", "organization", "location", "dates"]) && isTextList(row.bullets)) &&
    Array.isArray(resume.projects) && resume.projects.every(row => hasFields(row, ["name", "technologies", "dates"]) && isTextList(row.bullets)) &&
    Array.isArray(resume.skills) && resume.skills.every(row => hasFields(row, ["category"]) && isTextList(row.items)) &&
    (resume.education.length + resume.experience.length + resume.projects.length + resume.skills.length > 0);
}

function readDraft(tool, data) {
  if (tool === "resume" && validResume(data?.resume)) return { resume: data.resume };
  if (tool === "cover-letter") {
    const letter = data?.letter;
    if (hasFields(letter, ["name", "date", "subject", "salutation", "closing", "signature"]) &&
      ["contact", "links", "recipient", "paragraphs"].every(key => isTextList(letter[key])) &&
      letter.paragraphs.some(paragraph => paragraph.trim())) {
      return { letter };
    }
  }
  if (tool === "question" && isText(data?.text) && data.text.trim()) return { text: data.text.trim() };
  throw new Error("Invalid generated draft");
}

export default function ApplicationToolPage({ tool }) {
  return <ToolForm key={tool} tool={tool} />;
}

function ToolForm({ tool }) {
  const { resumeFile, setResumeFile, jobDesc, setJobDesc, toolDrafts, setToolDrafts } = useApplicationMaterials();
  const settings = tools[tool];
  const Icon = settings.icon;
  const draft = toolDrafts[tool] || {};
  const question = draft.question || "";
  const text = draft.text ?? "";
  const generated = Boolean(draft.version && (tool !== "cover-letter" || draft.letter));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fileError, setFileError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const fileInput = useRef(null);
  const request = useRef(null);
  const jobTooLong = jobDesc.trim().length > MAX_JOB_LENGTH;
  const questionTooLong = question.trim().length > MAX_QUESTION_LENGTH;
  const ready = resumeFile && jobDesc.trim() && !jobTooLong &&
    (tool !== "question" || (question.trim() && !questionTooLong));

  useEffect(() => {
    setLoading(false);
    setError("");
    setCopyStatus("");
    return () => { request.current?.abort(); request.current = null; };
  }, [resumeFile, jobDesc, question]);

  const editDraft = update => {
    setCopyStatus("");
    setToolDrafts(all => ({ ...all, [tool]: { ...all[tool], ...update } }));
  };

  const selectFile = event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/\.(pdf|docx|txt)$/i.test(file.name)) {
      setFileError("Choose a PDF, DOCX, or TXT resume.");
    } else if (!file.size || file.size > 5 * 1024 * 1024) {
      setFileError("Choose a nonempty file of 5 MB or less.");
    } else {
      setFileError("");
      setResumeFile(file);
    }
  };

  const generate = async event => {
    event.preventDefault();
    if (!ready || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    setCopyStatus("");
    const form = new FormData();
    form.append("resume", resumeFile);
    form.append("job_description", jobDesc.trim());
    if (tool === "question") form.append("question", question.trim());
    if (tool === "cover-letter") {
      const today = new Date();
      const month = String(today.getMonth() + 1).padStart(2, "0");
      const day = String(today.getDate()).padStart(2, "0");
      form.append("letter_date", [today.getFullYear(), month, day].join("-"));
    }
    try {
      const { data } = await axios.post(`${BASE_URL}/application-tools/${tool}/`, form, {
        headers: getAuthHeaders(), signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const content = readDraft(tool, data);
      setToolDrafts(all => ({
        ...all, [tool]: { ...all[tool], ...content, version: (all[tool]?.version || 0) + 1 },
      }));
    } catch (err) {
      if (!controller.signal.aborted) {
        const detail = err.response?.data?.detail;
        setError(typeof detail === "string" ? detail : "We couldn’t generate this draft. Please try again.");
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        setLoading(false);
      }
    }
  };

  const copyDraft = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("Copied to clipboard");
    } catch {
      setCopyStatus("Select the draft text and copy it with your keyboard.");
    }
  };

  return <main id="main-content" className={`tm-builder tm-builder--${tool}`}>
    <header className="tm-builder-header">
      <div className="tm-builder-title"><Icon aria-hidden="true" /><h1>{settings.title}</h1></div>
      <p>{settings.intro}</p>
    </header>
    <div className="tm-builder-layout">
      <form className="tm-builder-inputs" onSubmit={generate}>
        <h2>Your materials</h2>
        <div className="tm-builder-field">
          <label htmlFor="builder-file">Source resume</label>
          <div className="tm-builder-file">
            <input id="builder-file" ref={fileInput} type="file" accept=".pdf,.docx,.txt" onChange={selectFile}
              aria-describedby="builder-file-help" aria-invalid={fileError ? true : undefined} />
            <span className="tm-builder-file-icon" aria-hidden="true">{resumeFile ? <FiFileText /> : <FiUploadCloud />}</span>
            <span className="tm-builder-file-text"><strong>{resumeFile?.name || "Choose a resume"}</strong>
              <small id="builder-file-help">{resumeFile ? "Click to replace file" : "PDF, DOCX, or TXT · Up to 5 MB"}</small></span>
          </div>
          {resumeFile && <button type="button" className="tm-builder-remove" onClick={() => {
            setResumeFile(null); setFileError(""); fileInput.current?.focus();
          }}><FiX aria-hidden="true" /> Remove file</button>}
          {fileError && <p className="tm-builder-error" role="alert">{fileError}</p>}
        </div>
        <div className="tm-builder-field">
          <label htmlFor="builder-posting">Job description</label>
          <textarea id="builder-posting" value={jobDesc} onChange={event => setJobDesc(event.target.value)}
            placeholder="Paste the responsibilities and qualifications from the posting." rows={8} required
            aria-invalid={jobTooLong || undefined} aria-describedby={jobTooLong ? "builder-posting-error" : undefined} />
          {jobTooLong && <p className="tm-builder-error" id="builder-posting-error" role="alert">Shorten the job description to 30,000 characters or fewer.</p>}
        </div>
        {tool === "question" && <div className="tm-builder-field">
          <label htmlFor="builder-question">Application question</label>
          <textarea id="builder-question" value={question} onChange={event => {
            const value = event.target.value;
            setToolDrafts(all => ({ ...all, question: { question: value } }));
          }} placeholder="Paste one question from the application." rows={3} required
            aria-invalid={questionTooLong || undefined} aria-describedby={questionTooLong ? "builder-question-error" : undefined} />
          {questionTooLong && <p className="tm-builder-error" id="builder-question-error" role="alert">Shorten the question to 2,000 characters or fewer.</p>}
        </div>}
        <button className="tm-builder-submit" type="submit" disabled={!ready || loading}>
          {loading ? <>Generating draft <FiLoader className="tm-builder-spin" aria-hidden="true" /></> : <>{generated ? "Regenerate draft" : settings.action} <FiArrowRight aria-hidden="true" /></>}
        </button>
        {error && <p className="tm-builder-error" role="alert">{error}</p>}
      </form>
      <section className="tm-builder-output" aria-labelledby="builder-output-title" aria-busy={loading}>
        <div className="tm-builder-output-head">
          <h2 id="builder-output-title">{settings.result}</h2>
          {generated && tool === "question" && <div className="tm-builder-actions">
            <button type="button" disabled={!text.trim() || loading} onClick={copyDraft}>
              {copyStatus === "Copied to clipboard" ? <FiCheck aria-hidden="true" /> : <FiCopy aria-hidden="true" />} Copy
            </button>
          </div>}
        </div>
        {generated && tool === "resume" &&
          <ResumeDocument key={draft.version} resume={draft.resume} onChange={resume => editDraft({ resume })} />}
        {generated && tool === "cover-letter" &&
          <CoverLetterDocument key={draft.version} letter={draft.letter} onChange={letter => editDraft({ letter })} />}
        {generated && tool === "question" &&
          <div className="tm-builder-editor">
            <label htmlFor="builder-draft">Edit your answer</label>
            <textarea id="builder-draft" value={text} onChange={event => editDraft({ text: event.target.value })} disabled={loading} />
          </div>}
        {!generated &&
          <div className="tm-builder-empty"><div className="tm-builder-outline" aria-hidden="true"><Icon /><i /><i /><i /></div>
            <p>{loading ? "Preparing your draft…" : settings.empty}</p>
          </div>}
      </section>
    </div>
    <p className="tm-builder-announcement" role="status">{copyStatus || (loading ? "Generating your draft." : generated ? "Draft ready to edit." : "")}</p>
    {copyStatus && <p className="tm-builder-copy-status" aria-hidden="true">{copyStatus}</p>}
  </main>;
}
