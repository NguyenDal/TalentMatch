import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  FiArrowDown, FiArrowRight, FiArrowUpRight, FiCheck, FiCheckCircle,
  FiFileText, FiLayers, FiMessageCircle, FiPlus, FiTarget, FiUpload,
} from "react-icons/fi";
import "./HomeIntro.css";

const requirements = [
  { title: "React & component development", detail: "Found in your project experience", met: true },
  { title: "Responsive interface design", detail: "Found in your skills and projects", met: true },
  { title: "Git & team collaboration", detail: "Found in your work experience", met: true },
  { title: "TypeScript experience", detail: "Add an example if you have one", met: false },
];

const steps = [
  { icon: FiUpload, title: "Start with your story", description: "Upload your resume. Bring your experience, projects, and skills together in one place.", note: "YOUR RESUME" },
  { icon: FiFileText, title: "Add the opportunity", description: "Paste a job description for a role that interests you. We help break down what it asks for.", note: "THE JOB DESCRIPTION" },
  { icon: FiTarget, title: "See the bigger picture", description: "Explore your match, spot gaps, and use tailored Q&A to prepare for your next step.", note: "A CLEARER DIRECTION" },
];

function MatchPreview() {
  const [view, setView] = useState("requirements");

  return (
    <div className="tm-preview-stage">
      <div className="tm-preview-orbit" aria-hidden="true" />
      <div className="tm-resume-tag">
        <span className="tm-resume-icon"><FiFileText aria-hidden="true" /></span>
        <div><strong>Your next chapter.pdf</strong><span>A little experience. A lot of potential.</span></div>
        <FiCheckCircle className="tm-ready-icon" aria-label="Ready" />
      </div>
      <section className="tm-preview" aria-label="Example resume match analysis">
        <div className="tm-preview-topbar">
          <span><FiLayers aria-hidden="true" /> YOUR MATCH OVERVIEW</span>
          <span className="tm-example-label">Example</span>
        </div>
        <div className="tm-preview-summary">
          <div>
            <span className="tm-small-label">THE OPPORTUNITY</span>
            <h2>Frontend Developer</h2>
            <p>A new role. Familiar strengths.</p>
            <span className="tm-match-label"><span /> Strong foundation</span>
          </div>
          <div className="tm-score" aria-label="Example match score: 75 percent">
            <div><strong>75<span>%</span></strong><span>MATCH</span></div>
          </div>
        </div>
        <div className="tm-preview-switch" role="group" aria-label="Example analysis view">
          <button type="button" aria-pressed={view === "requirements"} onClick={() => setView("requirements")}>
            <FiCheckCircle aria-hidden="true" /> Requirements <span>4</span>
          </button>
          <button type="button" aria-pressed={view === "interview"} onClick={() => setView("interview")}>
            <FiMessageCircle aria-hidden="true" /> Interview prep
          </button>
        </div>
        <div className="tm-preview-content" aria-live="polite">
          {view === "requirements" ? (
            <ul className="tm-requirements">
              {requirements.map(({ title, detail, met }) => (
                <li key={title}>
                  <span className={"tm-requirement-icon " + (met ? "is-met" : "is-gap")}>
                    {met ? <FiCheck aria-label="Matched" /> : <FiPlus aria-label="To strengthen" />}
                  </span>
                  <div><strong>{title}</strong><span>{detail}</span></div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="tm-interview-example">
              <span className="tm-small-label">A QUESTION TO PREPARE FOR</span>
              <h3>“How do you build an interface that works on every screen?”</h3>
              <p>Start with a project from your resume. Explain your layout choices, how you tested them, and what you learned.</p>
              <span className="tm-interview-hint"><FiMessageCircle aria-hidden="true" /> Your experience is a great place to start.</span>
            </div>
          )}
        </div>
        <div className="tm-preview-bottom"><span className="tm-sparkle" aria-hidden="true">✦</span> Turn your experience into your next opportunity.</div>
      </section>
      <p className="tm-preview-caption">An illustrative preview. Your results will reflect your resume and the role.</p>
    </div>
  );
}

export default function HomeIntro() {
  return (
    <>
      <main className="tm-landing" id="main-content">
        <section className="tm-hero" aria-labelledby="tm-hero-title">
          <div className="tm-container tm-hero-grid">
            <div className="tm-hero-copy">
              <div className="tm-eyebrow"><span /> BIG AMBITIONS. CLEARER NEXT STEPS.</div>
              <h1 id="tm-hero-title">Your next move.<br />A clearer <span>match.</span></h1>
              <p className="tm-hero-description">You bring the experience. We help connect the dots. See how your resume fits a role, discover your strengths, and know where to focus next.</p>
              <div className="tm-hero-actions">
                <Link className="tm-button tm-button-primary" to="/signup">Find my match <FiArrowUpRight aria-hidden="true" /></Link>
                <a className="tm-button tm-button-text" href="#how-it-works">See how it works <FiArrowDown aria-hidden="true" /></a>
              </div>
              <div className="tm-hero-note"><span className="tm-note-line" /> A resume. A job description. A fresh perspective.</div>
            </div>
            <MatchPreview />
          </div>
        </section>

        <section className="tm-benefits" aria-label="What TalentMatch helps you do">
          <div className="tm-container tm-benefits-inner">
            <p>A little insight.<br /><strong>A more intentional job search.</strong></p>
            <div><FiFileText aria-hidden="true" /><span>Understand the role</span></div>
            <div><FiTarget aria-hidden="true" /><span>Recognize your strengths</span></div>
            <div><FiMessageCircle aria-hidden="true" /><span>Prepare with purpose</span></div>
          </div>
        </section>

        <section className="tm-how" id="how-it-works" aria-labelledby="tm-how-title">
          <div className="tm-container">
            <div className="tm-section-heading">
              <div><span className="tm-eyebrow">HOW IT WORKS</span><h2 id="tm-how-title">From “what if” to <span>what’s next.</span></h2></div>
              <p>Less guesswork, more direction.<br />Get to know your fit in three simple steps.</p>
            </div>
            <ol className="tm-steps">
              {steps.map(({ icon: Icon, title, description, note }, index) => (
                <li key={title}>
                  <div className="tm-step-top"><span className="tm-step-icon"><Icon aria-hidden="true" /></span><span className="tm-step-number">0{index + 1}</span></div>
                  <span className="tm-step-note">{note}</span>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="tm-final-cta" aria-labelledby="tm-cta-title">
          <div className="tm-container tm-cta-inner">
            <div><span className="tm-eyebrow">YOUR EXPERIENCE HAS POTENTIAL</span><h2 id="tm-cta-title">Let’s find where it fits.</h2><p>Your next opportunity starts with a little clarity.</p></div>
            <Link className="tm-button tm-button-light" to="/signup">Get started <FiArrowRight aria-hidden="true" /></Link>
          </div>
        </section>
      </main>
      <footer className="tm-footer">
        <div className="tm-container tm-footer-inner">
          <Link className="tm-footer-brand" to="/" aria-label="TalentMatch home"><FiLayers aria-hidden="true" /> TalentMatch<span>.</span></Link>
          <p>Built with purpose by An Nguyen.</p>
          <Link to="/contact">Get in touch <FiArrowUpRight aria-hidden="true" /></Link>
        </div>
      </footer>
    </>
  );
}
