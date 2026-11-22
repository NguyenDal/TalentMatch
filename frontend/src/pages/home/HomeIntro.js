import React from "react";
import { Link } from "react-router-dom";
import {
  FiArrowDown, FiArrowRight, FiArrowUpRight,
  FiBriefcase, FiFileText, FiLayers, FiTarget, FiUpload,
} from "react-icons/fi";
import "./HomeIntro.css";
import MatchWalkthrough from "./MatchWalkthrough";

const steps = [
  { icon: FiUpload, title: "Start with your story", description: "Upload your resume. Bring your experience, projects, and skills together in one place.", note: "YOUR RESUME" },
  { icon: FiFileText, title: "Choose a role", description: "Find an opening on an employer’s job board or paste a job description you already have.", note: "THE JOB DESCRIPTION" },
  { icon: FiTarget, title: "Prepare your application", description: "Check your skills against the posting, tailor your résumé and cover letter, and work through application questions.", note: "YOUR APPLICATION" },
];

export default function HomeIntro() {
  return (
    <>
      <main className="tm-landing" id="main-content">
        <section className="tm-hero" aria-labelledby="tm-hero-title">
          <div className="tm-container tm-hero-grid">
            <div className="tm-hero-copy">
              <h1 id="tm-hero-title">Find your fit.<br /><span>Make your case.</span></h1>
              <p className="tm-hero-description">Search employer job boards or paste a posting. Compare the skills it asks for with your experience, then tailor your résumé, cover letter, and application answers to the role.</p>
              <div className="tm-hero-actions">
                <Link className="tm-button tm-button-primary" to="/signup">Find jobs <FiArrowUpRight aria-hidden="true" /></Link>
                <a className="tm-button tm-button-text" href="#how-it-works">How it works <FiArrowDown aria-hidden="true" /></a>
              </div>
              <p className="tm-hero-note"><FiFileText aria-hidden="true" /> PDF, DOCX, or TXT résumés up to 5 MB</p>
            </div>
            <MatchWalkthrough />
          </div>
        </section>

        <section className="tm-job-sources" aria-labelledby="tm-job-sources-title">
          <div className="tm-container tm-source-list">
            <h2 id="tm-job-sources-title"><FiBriefcase aria-hidden="true" /> Employer boards you can search</h2>
            <ul><li>Affirm</li><li>D2L</li><li>Mozilla</li></ul>
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
          <Link to="/contact">Get in touch <FiArrowUpRight aria-hidden="true" /></Link>
        </div>
      </footer>
    </>
  );
}
