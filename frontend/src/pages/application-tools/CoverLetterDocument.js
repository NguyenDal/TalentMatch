import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FiCheck, FiCopy, FiEdit2, FiPrinter } from "react-icons/fi";
import "./ResumeDocument.css";
import "./CoverLetterDocument.css";

const lines = values => (values || []).map(value => value.trim()).filter(Boolean);
const subjectLine = value => value?.trim() ? `Re: ${value.trim().replace(/^re:\s*/i, "")}` : "";
const editedParagraphs = value => value.split(/\n{2}/);

const editGroups = [
  ["Letterhead", [["name", "Name"], ["contact", "Contact details", "lines"], ["links", "Professional links", "lines"]]],
  ["Letter details", [["date", "Date"], ["recipient", "Recipient and organization", "lines"], ["subject", "Subject"]]],
  ["Message", [["salutation", "Salutation"], ["paragraphs", "Body paragraphs", "paragraphs"], ["closing", "Closing"], ["signature", "Signature"]]],
];

export function coverLetterText(letter) {
  const header = [letter.name, lines(letter.contact).join(" | "), lines(letter.links).join(" | ")].filter(Boolean).join("\n");
  return [header, letter.date, lines(letter.recipient).join("\n"), subjectLine(letter.subject), letter.salutation,
    ...lines(letter.paragraphs), letter.closing, letter.signature].filter(Boolean).join("\n\n");
}

function contactUrl(text) {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return `mailto:${text}`;
  if (/^https?:\/\/[^\s]+$/i.test(text)) return text;
  if (/^(?:[\w-]+\.)+[a-z]{2,}(?:[/?#][^\s]*)?$/i.test(text)) return `https://${text}`;
  return undefined;
}

function ContactLine({ entries }) {
  const values = lines(entries);
  if (!values.length) return null;
  return <ul className="tm-cldoc-contact">{values.map((text, i) => {
    const href = contactUrl(text);
    return <li key={i}>{href ? <a href={href} target="_blank" rel="noreferrer">{text}</a> : text}</li>;
  })}</ul>;
}

function LetterPaper({ letter }) {
  const recipient = lines(letter.recipient);
  return <article className="tm-cldoc-paper" aria-label="Cover letter document">
    {(letter.name || lines(letter.contact).length > 0 || lines(letter.links).length > 0) && <header>
      {letter.name && <h2>{letter.name}</h2>}
      <ContactLine entries={letter.contact} /><ContactLine entries={letter.links} />
    </header>}
    {letter.date && <p className="tm-cldoc-date">{letter.date}</p>}
    {recipient.length > 0 && <div className="tm-cldoc-recipient">{recipient.map((line, i) => <p key={i}>{line}</p>)}</div>}
    {letter.subject && <p className="tm-cldoc-subject">{subjectLine(letter.subject)}</p>}
    {letter.salutation && <p className="tm-cldoc-salutation">{letter.salutation}</p>}
    {lines(letter.paragraphs).map((text, index) => <p className="tm-cldoc-paragraph" key={index}>{text}</p>)}
    {(letter.closing || letter.signature) && <footer>
      {letter.closing && <p>{letter.closing}</p>}
      {letter.signature && <p>{letter.signature}</p>}
    </footer>}
  </article>;
}

function LetterEditor({ letter, update }) {
  return <div className="tm-rdoc-editor">{editGroups.map(([group, fields]) =>
    <fieldset className="tm-rdoc-group" key={group}><legend>{group}</legend>
      {fields.map(([key, label, format]) => <label className="tm-rdoc-field" key={key}>
        <span>{label}{format && <small>{format === "lines" ? "One per line" : "Separate paragraphs with a blank line"}</small>}</span>
        {format ? <textarea rows={format === "paragraphs" ? 14 : 2}
          value={(letter[key] || []).join(format === "paragraphs" ? "\n\n" : "\n")}
          onChange={event => update(key, format === "paragraphs" ? editedParagraphs(event.target.value) : event.target.value.split("\n"))} />
          : <input value={letter[key] || ""} onChange={event => update(key, event.target.value)} />}
      </label>)}
    </fieldset>)}</div>;
}

export default function CoverLetterDocument({ letter, onChange }) {
  const [beforeEditing, setBeforeEditing] = useState(null);
  const [copyMessage, setCopyMessage] = useState("");
  useEffect(() => { setCopyMessage(""); }, [letter]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(coverLetterText(letter));
      setCopyMessage("Copied to clipboard");
    } catch {
      setCopyMessage("Select the letter text and copy it manually.");
    }
  }
  async function print() {
    // Wait for the locally served reference typeface when someone prints immediately.
    if (document.fonts) await document.fonts.ready;
    window.print();
  }
  return <div className="tm-rdoc tm-cldoc">
    <div className="tm-rdoc-actions" role="group" aria-label="Cover letter actions">
      {beforeEditing ? <>
        <button type="button" onClick={() => { onChange(beforeEditing); setBeforeEditing(null); }}>Cancel edits</button>
        <button type="button" className="tm-rdoc-primary" onClick={() => setBeforeEditing(null)}>Done editing</button>
      </> : <>
        <button type="button" onClick={() => { setCopyMessage(""); setBeforeEditing(letter); }}><FiEdit2 aria-hidden="true" /> Edit letter</button>
        <button type="button" onClick={copy}>{copyMessage === "Copied to clipboard" ? <FiCheck aria-hidden="true" /> : <FiCopy aria-hidden="true" />} Copy</button>
        <button type="button" className="tm-rdoc-primary" onClick={print}><FiPrinter aria-hidden="true" /> Print / Save PDF</button>
      </>}
    </div>
    <p className="tm-cldoc-status" role="status">{beforeEditing ? "" : copyMessage}</p>
    {beforeEditing ? <LetterEditor letter={letter} update={(key, value) => onChange({ ...letter, [key]: value })} /> :
      <div className="tm-rdoc-sheet"><LetterPaper letter={letter} /></div>}
    {createPortal(<div className="tm-cldoc-print"><LetterPaper letter={letter} /></div>, document.body)}
  </div>;
}
