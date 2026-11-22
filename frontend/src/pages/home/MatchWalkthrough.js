import React, { useEffect, useId, useRef, useState } from "react";
import {
  FiBarChart2, FiBriefcase, FiCheck, FiCheckCircle, FiEdit3, FiFileText,
  FiLayers, FiMapPin, FiPause, FiPlay, FiPlus, FiSearch, FiTarget,
} from "react-icons/fi";
import "./MatchWalkthrough.css";

const stages = [
  { label: "Find jobs", icon: FiSearch },
  { label: "Check fit", icon: FiTarget },
  { label: "Draft", icon: FiEdit3 },
];

const skills = [
  { name: "SQL", evidence: "Queried order data for a weekly report.", supported: true },
  { name: "Reporting", evidence: "Built a weekly revenue dashboard.", supported: true },
  { name: "Python", evidence: "Add an example if you’ve used it.", supported: false },
];
const supported = skills.filter(skill => skill.supported).length;
const score = Math.round(1000 * supported / skills.length) / 10;

const excerpts = [
  { label: "Résumé", heading: "Experience", text: "Built a weekly revenue dashboard using SQL to summarize order data." },
  { label: "Cover letter", heading: "Dear Hiring Team,", text: "At Willow Works, I’d bring the same approach I used to turn order data into a weekly revenue dashboard." },
  { label: "Application answer", heading: "How have you used SQL?", text: "I queried order data with SQL and used the results to build a weekly revenue dashboard." },
];

function FindJobs() {
  return <>
    <div className="tm-tour-heading"><h2>Jobs for your résumé</h2><p>Openings ranked by the skills you bring.</p></div>
    <div className="tm-tour-file"><FiFileText aria-hidden="true" /><span>analyst-resume.pdf</span></div>
    <div className="tm-tour-jobs">
      <div className="tm-tour-job tm-tour-job-selected">
        <span className="tm-tour-mark"><FiBarChart2 aria-hidden="true" /></span>
        <div><h3>Data Analyst</h3><p>Willow Works</p><small><FiMapPin aria-hidden="true" />Toronto, ON</small>
          <div className="tm-tour-tags" aria-label="Skills in your résumé"><span>SQL</span><span>Reporting</span></div>
        </div>
        <FiCheckCircle className="tm-tour-selected-check" aria-label="Selected role" />
      </div>
      <div className="tm-tour-job">
        <span className="tm-tour-mark tm-tour-mark-secondary"><FiBriefcase aria-hidden="true" /></span>
        <div><h3>Reporting Associate</h3><p>Cedar House · Remote</p></div>
      </div>
    </div>
  </>;
}

function CheckFit() {
  return <>
    <div className="tm-tour-heading"><h2>Check your fit</h2><p>Data Analyst · Willow Works</p></div>
    <div className="tm-tour-fit-summary">
      <div><strong>{score}<small>%</small></strong><span>Skill match</span></div>
      <div><span>{supported} of {skills.length} skills supported</span><div className="tm-tour-meter" aria-hidden="true">{skills.map(skill => <i key={skill.name} className={skill.supported ? "is-supported" : ""} />)}</div></div>
    </div>
    <ul className="tm-tour-evidence">{skills.map(({ name, evidence, supported: met }, index) =>
      <li key={name} style={{ "--tour-item": index }}>
        <span className={met ? "tm-tour-present" : "tm-tour-gap"}>{met ? <FiCheck aria-label="Supported" /> : <FiPlus aria-label="Needs evidence" />}</span>
        <div><strong>{name}</strong><p>{evidence}</p></div>
      </li>
    )}</ul>
  </>;
}

function Draft({ selected, onSelect }) {
  const excerpt = excerpts[selected];
  return <>
    <div className="tm-tour-heading"><h2>Prepare your application</h2><p>Data Analyst · Willow Works</p></div>
    <div className="tm-tour-draft-options" role="group" aria-label="Application draft examples">
      {excerpts.map(({ label }, index) => <button type="button" key={label} aria-pressed={selected === index} onClick={() => onSelect(index)}>{label}</button>)}
    </div>
    <div className="tm-tour-draft-page" key={excerpt.label}>
      <div className="tm-tour-page-label"><FiFileText aria-hidden="true" />{excerpt.label} excerpt</div>
      <h3>{excerpt.heading}</h3><p>{excerpt.text}</p>
      <div className="tm-tour-paper-lines" aria-hidden="true"><i /><i /></div>
    </div>
  </>;
}

export default function MatchWalkthrough() {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(0);
  const [playing, setPlaying] = useState(() => !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  const stage = useRef(null);
  const panelId = useId();
  const running = playing && !hovered && !focused && visible && pageVisible;

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handlePreference = () => { if (preference.matches) setPlaying(false); };
    const handleVisibility = () => setPageVisible(!document.hidden);
    preference.addEventListener("change", handlePreference);
    document.addEventListener("visibilitychange", handleVisibility);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.25 });
    observer.observe(stage.current);
    return () => {
      preference.removeEventListener("change", handlePreference);
      document.removeEventListener("visibilitychange", handleVisibility);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setTimeout(() => setStep(current => (current + 1) % stages.length), 6000);
    return () => window.clearTimeout(timer);
  }, [running, step]);

  function togglePlayback() {
    setPlaying(value => !value);
    setHovered(false);
    setFocused(false);
  }

  return (
    <div className="tm-preview-stage tm-walkthrough" ref={stage}>
      <section className="tm-demo-window" aria-label="How TalentMatch works: interactive example" data-running={running}
        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
        <div className="tm-tour-bar">
          <span><FiLayers aria-hidden="true" /> Workspace preview</span>
          <button type="button" onClick={togglePlayback} aria-label={playing ? "Pause walkthrough" : "Play walkthrough"}>
            {playing ? <FiPause aria-hidden="true" /> : <FiPlay aria-hidden="true" />}{playing ? "Pause" : "Play"}
          </button>
        </div>
        <div className="tm-tour-stages" role="group" aria-label="Walkthrough steps">{stages.map(({ label, icon: Icon }, index) =>
          <button key={label} type="button" aria-pressed={step === index} aria-controls={`${panelId}-${index}`}
            onClick={() => { setPlaying(false); setStep(index); }}>
            <Icon aria-hidden="true" /><span>{label}</span>
          </button>
        )}</div>
        <div className="tm-tour-panels" aria-live={playing ? "off" : "polite"} aria-atomic="true">
          {stages.map(({ label }, index) => (
            <div className="tm-tour-scene" key={label} id={`${panelId}-${index}`} aria-hidden={step !== index} inert={step !== index}>
              {index === 0 ? <FindJobs /> : index === 1 ? <CheckFit /> :
                <Draft selected={draft} onSelect={value => { setPlaying(false); setDraft(value); }} />}
            </div>
          ))}
        </div>
      </section>
      <p className="tm-preview-caption">Example résumé and job postings.</p>
    </div>
  );
}
