import React from "react";
import { Link } from "react-router-dom";
import { FiArrowLeft, FiFileText, FiTarget, FiTrendingUp } from "react-icons/fi";
import PublicFooter from "./PublicFooter";
import "./AuthPages.css";

const steps = [
  { icon: FiFileText, title: "Your experience, in focus", text: "Start with the skills and stories on your resume." },
  { icon: FiTarget, title: "A role that makes sense", text: "See where your strengths meet the opportunity." },
  { icon: FiTrendingUp, title: "A more confident next step", text: "Know what to highlight and where to grow." },
];

export default function AuthLayout({ mode, title, subtitle, children }) {
  return (
    <>
      <main className={`tm-auth tm-auth--${mode}`}>
        <div className="tm-container tm-auth-grid">
          <aside className="tm-auth-story" aria-label="Your next chapter with TalentMatch">
            <div className="tm-auth-story-copy">
              <span className="tm-eyebrow"><span /> MADE FOR YOUR NEXT MOVE</span>
              <h2>A little clarity.<br />A world of <span>possibility.</span></h2>
              <p>Your experience has a story to tell. Let’s find the opportunity that brings it to life.</p>
            </div>
            <ol className="tm-auth-journey">
              {steps.map(({ icon: Icon, title: stepTitle, text }, index) => (
                <li key={stepTitle}>
                  <span className="tm-auth-journey-icon"><Icon aria-hidden="true" /></span>
                  <div><h3>{stepTitle}</h3><p>{text}</p></div>
                  <span className="tm-auth-step" aria-hidden="true">0{index + 1}</span>
                </li>
              ))}
            </ol>
            <div className="tm-auth-story-note"><span aria-hidden="true">✦</span> Your next chapter starts with you.</div>
          </aside>
          <section className="tm-auth-form-panel" aria-labelledby="tm-auth-title">
            <Link className="tm-auth-back" to="/"><FiArrowLeft aria-hidden="true" /> Back to home</Link>
            <header className="tm-auth-heading">
              <span className="tm-eyebrow">{mode === "signup" ? "LET’S GET YOU STARTED" : "YOUR NEXT CHAPTER AWAITS"}</span>
              <h1 id="tm-auth-title">{title}</h1>
              <p>{subtitle}</p>
            </header>
            {children}
          </section>
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
