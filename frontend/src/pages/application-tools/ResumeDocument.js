import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FiEdit2, FiPlus, FiPrinter, FiX } from "react-icons/fi";
import "./ResumeDocument.css";

// The printed document follows Jake Gutierrez's single-column, letter-size layout.
const sections = [
  { key: "education", label: "Education", entry: "school", fields: [
    ["school", "School"], ["degree", "Degree"], ["location", "Location"], ["dates", "Dates"],
  ] },
  { key: "experience", label: "Experience", entry: "position", fields: [
    ["title", "Job title"], ["organization", "Organization"], ["location", "Location"], ["dates", "Dates"],
    ["bullets", "Achievements", true],
  ] },
  { key: "projects", label: "Projects", entry: "project", fields: [
    ["name", "Project name"], ["technologies", "Technologies"], ["dates", "Dates"], ["bullets", "Achievements", true],
  ] },
  { key: "skills", label: "Technical Skills", entry: "skill group", fields: [
    ["category", "Category"], ["items", "Skills", true],
  ] },
];

const filledLines = value => (value || []).map(line => line.trim()).filter(Boolean);

function ContactItem({ text }) {
  let href;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) href = `mailto:${text}`;
  else if (/^https?:\/\/[^\s]+$/i.test(text)) href = text;
  else if (/^(?:www\.|(?:github|linkedin)\.com\/)[^\s]+$/i.test(text)) href = `https://${text}`;
  return href ? <a href={href} target="_blank" rel="noreferrer">{text}</a> : text;
}

function EntryRow({ left, right, secondary = false }) {
  if (!left && !right) return null;
  return <div className={`tm-rdoc-row${secondary ? " tm-rdoc-secondary" : ""}`}>
    <span>{left}</span><span>{right}</span>
  </div>;
}

function ResumeEntry({ type, entry }) {
  const bullets = filledLines(entry.bullets);
  switch (type) {
    case "education":
      return <div className="tm-rdoc-entry">
        <EntryRow left={entry.school} right={entry.location} />
        <EntryRow left={entry.degree} right={entry.dates} secondary />
      </div>;
    case "skills":
      return <p className="tm-rdoc-skills"><strong>{entry.category}{entry.category && filledLines(entry.items).length ? ": " : ""}</strong>{filledLines(entry.items).join(", ")}</p>;
    default:
      return <div className="tm-rdoc-entry">
        <div className="tm-rdoc-entry-heading">
          {type === "experience" ? <>
            <EntryRow left={entry.title} right={entry.dates} />
            <EntryRow left={entry.organization} right={entry.location} secondary />
          </> : <EntryRow left={<>{entry.name}{entry.name && entry.technologies && " | "}<i>{entry.technologies}</i></>} right={entry.dates} />}
        </div>
        {bullets.length > 0 && <ul>{bullets.map((text, i) => <li key={i}>{text}</li>)}</ul>}
      </div>;
  }
}

function hasEntryContent(entry) {
  return Object.values(entry).some(value => Array.isArray(value) ? filledLines(value).length > 0 : Boolean(value?.trim()));
}

function ResumePaper({ resume }) {
  const contacts = filledLines(resume.contact);
  return <article className="tm-rdoc-paper" aria-label="Résumé document">
    {(resume.name || contacts.length > 0) && <header className="tm-rdoc-paper-header">
      {resume.name && <h2>{resume.name}</h2>}
      {contacts.length > 0 && <ul className="tm-rdoc-contacts">
        {contacts.map((text, index) => <li key={index}><ContactItem text={text} /></li>)}
      </ul>}
    </header>}
    {sections.map(({ key, label }) => {
      const entries = (resume[key] || []).filter(hasEntryContent);
      if (!entries.length) return null;
      return <section key={key} className="tm-rdoc-section">
        <h3>{label}</h3>
        {entries.map((entry, index) => <ResumeEntry key={index} type={key} entry={entry} />)}
      </section>;
    })}
  </article>;
}

function EditField({ label, lines, value, onChange }) {
  return <label className={lines ? "tm-rdoc-field tm-rdoc-long-field" : "tm-rdoc-field"}>
    <span>{label}{lines && <small>One per line</small>}</span>
    {lines
      ? <textarea rows="3" value={(value || []).join("\n")} onChange={event => onChange(event.target.value.split("\n"))} />
      : <input type="text" value={value || ""} onChange={event => onChange(event.target.value)} />}
  </label>;
}

function ResumeEditor({ draft, setDraft }) {
  function setEntries(key, entries) {
    setDraft({ ...draft, [key]: entries });
  }
  return <div className="tm-rdoc-editor">
    <fieldset className="tm-rdoc-group"><legend>Contact details</legend>
      <EditField label="Name" value={draft.name} onChange={name => setDraft({ ...draft, name })} />
      <EditField label="Contact information" lines value={draft.contact} onChange={contact => setDraft({ ...draft, contact })} />
    </fieldset>
    {sections.map(({ key, label, entry: entryName, fields }) => {
      const entries = draft[key] || [];
      return <fieldset key={key} className="tm-rdoc-group"><legend>{label}</legend>
        {entries.map((entry, index) => <fieldset key={index} className="tm-rdoc-fields">
          <legend className="tm-rdoc-sr">{entryName} {index + 1}</legend>
          {fields.map(([field, fieldLabel, lines]) => <EditField key={field} label={fieldLabel} lines={lines}
            value={entry[field]} onChange={value => setEntries(key, entries.map((item, i) => i === index ? { ...item, [field]: value } : item))} />)}
          <button type="button" className="tm-rdoc-remove" aria-label={`Remove ${entryName} ${index + 1}`}
            onClick={() => setEntries(key, entries.filter((_, i) => i !== index))}><FiX aria-hidden="true" /> Remove</button>
        </fieldset>)}
        <button type="button" className="tm-rdoc-add" onClick={() =>
          setEntries(key, [...entries, Object.fromEntries(fields.map(([field, , lines]) => [field, lines ? [] : ""]))])}>
          <FiPlus aria-hidden="true" /> Add {entryName}
        </button>
      </fieldset>;
    })}
  </div>;
}

export default function ResumeDocument({ resume, onChange }) {
  const [local, setLocal] = useState(resume);
  const [beforeEditing, setBeforeEditing] = useState(null);
  useEffect(() => { setLocal(resume); }, [resume]);
  const current = onChange ? resume : local;
  const setCurrent = onChange || setLocal;

  return <div className="tm-rdoc">
    <div className="tm-rdoc-actions" role="group" aria-label="Résumé actions">
      {beforeEditing ? <>
        <button type="button" onClick={() => { setCurrent(beforeEditing); setBeforeEditing(null); }}>Cancel edits</button>
        <button type="button" className="tm-rdoc-primary" onClick={() => setBeforeEditing(null)}>Done editing</button>
      </> : <>
        <button type="button" onClick={() => setBeforeEditing(current)}><FiEdit2 aria-hidden="true" /> Edit résumé</button>
        <button type="button" className="tm-rdoc-primary" onClick={() => window.print()}><FiPrinter aria-hidden="true" /> Print / Save PDF</button>
      </>}
    </div>
    {beforeEditing ? <ResumeEditor draft={current} setDraft={setCurrent} /> : <div className="tm-rdoc-sheet"><ResumePaper resume={current} /></div>}
    {createPortal(<div className="tm-rdoc-print"><ResumePaper resume={current} /></div>, document.body)}
  </div>;
}
