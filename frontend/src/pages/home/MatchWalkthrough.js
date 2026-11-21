import React, { useEffect, useId, useRef, useState } from "react";
import { FiArrowRight, FiCheck, FiFileText, FiLayers, FiPause, FiPlay, FiPlus, FiUpload } from "react-icons/fi";
import "./MatchWalkthrough.css";

const demoSteps = [
  { label: "Your resume", title: "Start with your story.", description: "Upload a resume to bring your experience into focus." },
  { label: "The opportunity", title: "Add a role you love.", description: "Paste the job description. We’ll connect the dots." },
  { label: "Your match", title: "Know where you stand.", description: "See your strengths, spot gaps, and plan your next step." },
];

const matches = [
  { title: "React & component development", detail: "A strength from your projects", met: true },
  { title: "Responsive interface design", detail: "Your skills meet this requirement", met: true },
  { title: "TypeScript experience", detail: "An opportunity to build on", met: false },
];

function ResumeStep() {
  return (
    <div className="tm-demo-upload">
      <div className="tm-demo-dropzone" aria-hidden="true"><FiUpload /><span>Your experience starts here</span></div>
      <div className="tm-demo-file">
        <div className="tm-demo-file-heading">
          <span className="tm-demo-file-icon"><FiFileText aria-hidden="true" /></span>
          <div><strong>Your next chapter.pdf</strong><span>Experience. Projects. Possibility.</span></div>
          <FiCheck className="tm-demo-file-check" aria-label="Resume ready" />
        </div>
        <div className="tm-demo-resume-lines" aria-hidden="true"><i /><i /><i /></div>
        <div className="tm-demo-skills"><span>React</span><span>UI design</span><span>Teamwork</span></div>
        <div className="tm-demo-upload-track" aria-hidden="true"><span /></div>
      </div>
      <p className="tm-demo-success"><FiCheck aria-hidden="true" /> Resume ready. Next, the opportunity.</p>
    </div>
  );
}

function JobStep() {
  return (
    <div className="tm-demo-job">
      <div className="tm-demo-document">
        <span className="tm-demo-document-label">JOB DESCRIPTION</span>
        <h3>Frontend Developer</h3>
        <div className="tm-demo-job-copy">
          <p>Build thoughtful, accessible web experiences.</p>
          <p>Bring React skills and an eye for responsive design.</p>
          <p>Collaborate with a team. Grow with TypeScript.</p>
        </div>
        <div className="tm-demo-skills"><span>React</span><span>Responsive design</span><span>TypeScript</span></div>
      </div>
      <div className="tm-demo-analyze" aria-hidden="true"><span>Find my match</span><FiArrowRight /></div>
      <p className="tm-demo-footnote">Your resume + this role. A clearer picture.</p>
    </div>
  );
}

function ResultsStep() {
  return (
    <div className="tm-demo-results">
      <div className="tm-demo-result-summary">
        <div><span className="tm-demo-document-label">FRONTEND DEVELOPER</span><h3>A strong foundation.</h3><p>You bring a lot to this role.</p></div>
        <div className="tm-demo-score" role="img" aria-label="Example match score: 75 percent">
          <svg viewBox="0 0 100 100" aria-hidden="true"><circle className="tm-demo-score-track" cx="50" cy="50" r="44" /><circle className="tm-demo-score-fill" cx="50" cy="50" r="44" pathLength="100" /></svg>
          <div><strong>75<span>%</span></strong><span>MATCH</span></div>
        </div>
      </div>
      <ul className="tm-demo-match-list">
        {matches.map(({ title, detail, met }, index) => (
          <li key={title} style={{ "--tm-item": index }}><span className={`tm-demo-match-icon ${met ? "is-met" : "is-gap"}`}>{met ? <FiCheck aria-label="Matched" /> : <FiPlus aria-label="To strengthen" />}</span><div><strong>{title}</strong><span>{detail}</span></div></li>
        ))}
      </ul>
      <p className="tm-demo-result-note">A little insight. A more confident next move.</p>
    </div>
  );
}

export default function MatchWalkthrough() {
  const [step, setStep] = useState(0);
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
    const timer = window.setTimeout(() => setStep((current) => (current + 1) % demoSteps.length), 6000);
    return () => window.clearTimeout(timer);
  }, [running, step]);

  const chooseStep = (index) => {
    setPlaying(false);
    setStep(index);
  };

  return (
    <div className="tm-preview-stage tm-walkthrough" ref={stage}>
      <div className="tm-preview-orbit" aria-hidden="true" />
      <section
        className="tm-demo-window"
        aria-label="How TalentMatch works: interactive example"
        data-running={running}
        data-paused={!playing}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
      >
        <div className="tm-demo-topbar"><span><FiLayers aria-hidden="true" /> A LITTLE PREVIEW</span><span className="tm-demo-example">Sample data</span></div>
        <div className="tm-demo-step-nav" role="group" aria-label="Walkthrough steps">
          {demoSteps.map(({ label }, index) => (
            <button type="button" key={label} aria-pressed={step === index} aria-controls={panelId} onClick={() => chooseStep(index)}>
              <span className="tm-demo-step-number">{index < step ? <FiCheck aria-hidden="true" /> : `0${index + 1}`}</span><span>{label}</span><i aria-hidden="true" />
            </button>
          ))}
        </div>
        <div id={panelId} className="tm-demo-panel" aria-live={playing ? "off" : "polite"} aria-atomic="true">
          <div className="tm-demo-scene" key={step}>
            <div className="tm-demo-heading"><span>STEP 0{step + 1}</span><h2>{demoSteps[step].title}</h2><p>{demoSteps[step].description}</p></div>
            {step === 0 ? <ResumeStep /> : step === 1 ? <JobStep /> : <ResultsStep />}
          </div>
        </div>
        <div className="tm-demo-controls">
          <span><i className={running ? "is-playing" : ""} aria-hidden="true" /> {playing ? "A quick look, step by step" : "Explore at your own pace"}</span>
          <button type="button" onClick={() => { setPlaying((value) => !value); setHovered(false); setFocused(false); }} aria-label={playing ? "Pause walkthrough" : "Play walkthrough"}>{playing ? <FiPause aria-hidden="true" /> : <FiPlay aria-hidden="true" />} {playing ? "Pause" : "Play"}</button>
        </div>
      </section>
      <p className="tm-preview-caption">An illustrative walkthrough. Your results reflect your resume and the role.</p>
    </div>
  );
}
