import React from "react";
import { Link } from "react-router-dom";
import {
  FiArrowDown, FiArrowRight, FiArrowUpRight,
  FiFileText, FiLayers, FiMessageCircle, FiTarget, FiUpload,
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
              <div className="tm-eyebrow"><span /> BIG AMBITIONS. CLEARER NEXT STEPS.</div>
              <h1 id="tm-hero-title">Your next move.<br />A clearer <span>match.</span></h1>
              <p className="tm-hero-description">Find open roles that match your experience. Pick a posting to check your skills and prepare a résumé, cover letter, and answers for that application.</p>
              <div className="tm-hero-actions">
                <Link className="tm-button tm-button-primary" to="/signup">Find my match <FiArrowUpRight aria-hidden="true" /></Link>
                <a className="tm-button tm-button-text" href="#how-it-works">See how it works <FiArrowDown aria-hidden="true" /></a>
              </div>
              <div className="tm-hero-note"><span className="tm-note-line" /> A resume. A job description. A fresh perspective.</div>
            </div>
            <MatchWalkthrough />
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
          <Link to="/contact">Get in touch <FiArrowUpRight aria-hidden="true" /></Link>
        </div>
      </footer>
    </>
  );
}
