import React from "react";
import {
  FiArrowRight, FiArrowUpRight, FiCalendar, FiCode, FiCpu, FiFileText,
  FiGrid, FiLayers, FiMail, FiMessageCircle,
} from "react-icons/fi";
import PublicFooter from "./PublicFooter";
import portrait from "./assets/nguyen-dal.jpg";
import "./ContactPage.css";

const profile = {
  name: "An Nguyen",
  countryCode: "+1",
  phone: "782-409-5339",
  email: "annguyen270504@gmail.com",
  resume: "https://talentmatch-userfiles.s3.ca-central-1.amazonaws.com/resume/Nguyen_s_Resume.pdf",
  blurb: "Applied CS graduate passionate about full-stack development, AI, and developer tooling. Building TalentMatch.",
  skills: ["React", "FastAPI", "Python", "Java", "Node.js", "PostgreSQL", "AWS S3", "Tailwind CSS", "Unity/C#", "MySQL"],
};

const projects = [
  {
    title: "TalentMatch",
    stack: "React · FastAPI · PostgreSQL · AWS S3",
    link: "https://github.com/NguyenDal/TalentMatch",
    description: "Resume → Job Description matcher with AI-powered requirement extraction, match scoring, and Q&A.",
    icon: FiLayers,
    category: "WEB APPLICATION",
  },
  {
    title: "GAMBIT (BCI + Unity)",
    stack: "Unity · C# · Arduino",
    link: "https://github.com/NguyenDal/GAMBIT",
    description: "Technical direction and integration of Arduino Bluetooth controller with Unity; improved BCI UX.",
    icon: FiCpu,
    category: "INTERACTIVE SYSTEMS",
  },
  {
    title: "Dalhousie Chess Club Website",
    stack: "React · Node.js · MySQL",
    link: "https://github.com/NguyenDal/Dalhousie-Chess-Club",
    description: "Production site with real-time updates, CORS fixes, server deploy, and 40% backend perf gains.",
    icon: FiGrid,
    category: "WEB DEVELOPMENT",
  },
];

export default function ContactPage() {
  const phoneDigits = profile.phone.replace(/[^0-9]/g, "");
  const countryDigits = profile.countryCode.replace(/[^0-9]/g, "");
  const phoneE164 = profile.countryCode + phoneDigits;
  const emailHref = "mailto:" + profile.email + "?subject=Opportunity for " +
    encodeURIComponent(profile.name) + "&body=Hi " + encodeURIComponent(profile.name) + ",%0D%0A%0D%0A";
  const whatsappHref = "https://wa.me/" + countryDigits + phoneDigits + "?text=" +
    encodeURIComponent("Hi " + profile.name + ", I’d love to connect about an opportunity.");

  const channels = [
    { title: "Email", icon: FiMail, detail: profile.email, description: "Best for detailed opportunities.", action: "Send an email", href: emailHref },
    { title: "Book a call", icon: FiCalendar, detail: "A 30-minute conversation", description: "Find a time that works on Cal.com.", action: "Pick a time", href: "https://cal.com/nguyen-an-nguyen-j42hfc/30min", external: true },
    { title: "WhatsApp", icon: FiMessageCircle, detail: phoneE164, description: "For a quick, informal conversation.", action: "Start a chat", href: whatsappHref, external: true },
  ];

  return (
    <>
      <main className="tm-contact" id="main-content">
        <section className="tm-contact-hero" aria-labelledby="contact-title">
          <div className="tm-contact-container tm-contact-hero-grid">
            <div className="tm-contact-intro">
              <span className="tm-contact-eyebrow"><span /> A LITTLE ABOUT THE BUILDER</span>
              <h1 id="contact-title">The person behind<br />the <span>match.</span></h1>
              <p className="tm-contact-name">Hi, I’m {profile.name}.</p>
              <p className="tm-contact-bio">{profile.blurb}</p>
              <div className="tm-contact-actions">
                <a className="tm-contact-button tm-contact-button-primary" href={emailHref}>
                  Let’s connect <FiArrowUpRight aria-hidden="true" />
                </a>
                <a className="tm-contact-button tm-contact-button-outline" href={profile.resume} target="_blank" rel="noopener noreferrer">
                  <FiFileText aria-hidden="true" /> View resume <FiArrowUpRight aria-hidden="true" />
                </a>
              </div>
            </div>
            <div className="tm-contact-portrait">
              <div className="tm-contact-orbit tm-contact-orbit-outer" aria-hidden="true" />
              <div className="tm-contact-orbit tm-contact-orbit-inner" aria-hidden="true" />
              <span className="tm-contact-floating-icon tm-contact-floating-code" aria-hidden="true"><FiCode /></span>
              <span className="tm-contact-floating-icon tm-contact-floating-layers" aria-hidden="true"><FiLayers /></span>
              <div className="tm-contact-photo-frame">
                <img src={portrait} alt="An Nguyen in graduation attire outside Dalhousie University's Faculty of Computer Science" width="1536" height="2048" />
              </div>
              <div className="tm-contact-portrait-caption"><span>AN NGUYEN</span><strong>Applied CS · Full-stack · AI</strong></div>
            </div>
          </div>
          <div className="tm-contact-container tm-contact-toolkit">
            <span className="tm-contact-toolkit-label">THE TOOLKIT</span>
            <ul aria-label="Skills and technologies">
              {profile.skills.map(skill => <li key={skill}>{skill}</li>)}
            </ul>
          </div>
        </section>

        <section className="tm-contact-work" aria-labelledby="contact-work-title">
          <div className="tm-contact-container">
            <div className="tm-contact-section-heading">
              <div><span className="tm-contact-eyebrow">SELECTED WORK</span><h2 id="contact-work-title">Ideas, put into practice.</h2></div>
              <p>A few projects across web development,<br />AI, and interactive systems.</p>
            </div>
            <div className="tm-contact-projects">
              {projects.map(({ title, stack, link, description, icon: Icon, category }, index) => (
                <article className="tm-contact-project" key={title}>
                  <div className="tm-contact-project-top">
                    <span className="tm-contact-project-icon"><Icon aria-hidden="true" /></span>
                    <span className="tm-contact-project-number" aria-hidden="true">0{index + 1}</span>
                  </div>
                  <span className="tm-contact-category">{category}</span>
                  <h3>{title}</h3>
                  <p className="tm-contact-stack">{stack}</p>
                  <p className="tm-contact-project-description">{description}</p>
                  <a href={link} target="_blank" rel="noopener noreferrer" aria-label={"View " + title + " project (opens in a new tab)"}>
                    Explore project <FiArrowUpRight aria-hidden="true" />
                  </a>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="tm-contact-connect" aria-labelledby="contact-connect-title">
          <div className="tm-contact-container">
            <div className="tm-contact-section-heading">
              <div><span className="tm-contact-eyebrow">GET IN TOUCH</span><h2 id="contact-connect-title">Let’s start a conversation.</h2></div>
              <p>Have an opportunity, a project idea, or a question?<br />Choose the way that works for you.</p>
            </div>
            <div className="tm-contact-channels">
              {channels.map(({ title, icon: Icon, detail, description, action, href, external }) => (
                <a className="tm-contact-channel" key={title} href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>
                  <div className="tm-contact-channel-title"><Icon aria-hidden="true" /><h3>{title}</h3></div>
                  <p className="tm-contact-channel-detail">{detail}</p>
                  <p>{description}</p>
                  <span className="tm-contact-channel-action">{action} <FiArrowRight aria-hidden="true" /></span>
                </a>
              ))}
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
