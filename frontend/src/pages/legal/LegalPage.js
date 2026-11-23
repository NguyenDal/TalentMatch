import React from "react";
import { Link } from "react-router-dom";
import "./LegalPage.css";

const contactEmail = "annguyen270504@gmail.com";
const contactLink = <a href={`mailto:${contactEmail}`}>{contactEmail}</a>;

const privacy = {
  title: "Privacy Policy",
  introduction: "You can browse jobs, compare your résumé with a role, and prepare an application with TalentMatch. The information we use depends on which of these tools you choose.",
  sections: [
    {
      id: "account",
      title: "Your account and profile",
      body: <>
        <p>We store your username, email address, and email verification status to operate your account. When you agree to the Privacy Policy and Terms and Conditions at signup, we record the version and time of acceptance. If you set a password, we store a password hash. Our email delivery service receives your email address and the message when we send a verification code or password reset link.</p>
        <p>You can add a field of study, preferred job titles, and a profile picture in Settings. Render hosts the app, Neon hosts the account database, and Amazon S3 stores uploaded profile pictures. We display your picture through a direct S3 link. Anyone who has that link may be able to view the image.</p>
      </>,
    },
    {
      id: "google-sign-in",
      title: "Sign in with Google",
      body: <>
        <p>If you choose Google sign-in, we request identity and email permissions. Google provides a unique account identifier, your email address, and information used to verify that address, including a Google Workspace domain when applicable. We use these details to create or link your TalentMatch account and recognize you when you return.</p>
        <p>Our hosting and database providers process the identifier and email to operate your account. Our email provider uses the address to deliver account messages. These sign-in permissions give us no access to your Gmail messages, contacts, or Drive files. We limit our use of information received from Google to the account functions described here. <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>.</p>
        <p>You can remove the connection in your Google Account. To delete the account information already held by TalentMatch, use the account deletion control below. <a href="https://myaccount.google.com/connections">Manage your Google connections</a>.</p>
      </>,
    },
    {
      id: "jobs",
      title: "Job searches and applications",
      body: <>
        <p>We retrieve public listings from employers’ Greenhouse job boards. TalentMatch processes your keywords, location filters, and any résumé you add for ranking on our server. Requests to job boards contain the board or posting being requested. Your search terms and résumé stay out of those requests.</p>
        <p>Apply opens the employer’s site. The employer receives the information you choose to submit there under its own privacy policy. If you confirm in TalentMatch that you applied, we store the posting identifier, employer, job title, location, link, and confirmation time with your account so you can find it in Applied jobs.</p>
      </>,
    },
    {
      id: "ai-tools",
      title: "Résumés and AI tools",
      body: <>
        <p>For a job fit check, we send OpenAI the text of the job posting, text extracted from your résumé, and the resulting skill assessments to generate feedback. For a tailored résumé, cover letter, or application answer, we send the résumé text, job posting, and any application question you enter. This can include contact details or other personal information in your document.</p>
        <p>For personalized career suggestions, we send OpenAI the profile text you have entered for your field of study and preferred job titles. We temporarily cache suggestions to avoid repeating the same request. OpenAI describes how it handles API content, including provider-side retention, in its <a href="https://developers.openai.com/api/docs/guides/your-data">API data controls</a>.</p>
        <p>The workspace keeps your selected résumé, posting, and current drafts in the open tab. Refreshing or closing the page clears that working copy. These materials are processed for your request and are not saved as documents in the TalentMatch account database. Copies you download or share remain wherever you save or send them.</p>
      </>,
    },
    {
      id: "security",
      title: "Sign-in activity and browser storage",
      body: <>
        <p>We record login times, session identifiers, IP addresses, and browser or device information so you can review and revoke sessions. At password sign-in, we may send your public IP address to ipapi.co to estimate the city, region, and country shown in login activity. This estimate can reflect your internet provider or a VPN.</p>
        <p>Your browser stores your TalentMatch session token, username, and email for the tab. Choosing Remember me uses persistent browser storage and extends the session from one day to 30 days. Signing out clears those stored sign-in details. We also store your theme preference and use a short-lived cookie during Google sign-in to match the response to your browser.</p>
      </>,
    },
    {
      id: "your-choices",
      title: "Access, correction, and deletion",
      body: <>
        <p>You can review and edit your account and profile in Settings and sign out devices under Security. To remove your account, open Settings, choose Account, then select Delete account. This removes your account, profile, policy acceptance record, linked Google identity, saved applications, and associated login and session records from our active database.</p>
        <p>Clearing a profile picture or deleting your account removes its profile link. The uploaded file can remain in S3. To request removal of a stored picture, access to your information, or help correcting or deleting it, email {contactLink}.</p>
        <p>Service providers may retain separate operational logs or backups under their own retention schedules. An employer manages the application materials you sent directly to it.</p>
      </>,
    },
    {
      id: "contact",
      title: "Contact and policy updates",
      body: <>
        <p>For privacy questions, contact An Nguyen at {contactLink}. When you get in touch, we receive the contact details and message you provide so we can respond. The contact page also offers WhatsApp and Cal.com. If you use one of those services, it processes your chat or booking under its own policy.</p>
        <p>We will date changes to this policy here. If we plan to use Google account data for a new purpose, we will explain the change and ask for your consent before using it that way.</p>
      </>,
    },
  ],
};

const terms = {
  title: "Terms and Conditions",
  introduction: "These terms cover TalentMatch’s job search, fit assessments, application tracker, and writing tools. When you create an account, checking the agreement box confirms that you agree to these terms and the Privacy Policy.",
  sections: [
    {
      id: "your-account",
      title: "Using your account",
      body: <p>Provide accurate account details, use an email address you control, and keep your sign-in credentials private. If you believe someone else has accessed your account, review your sessions in Settings under Security and contact TalentMatch. You can close your account at any time in Settings under Account.</p>,
    },
    {
      id: "your-materials",
      title: "Your materials",
      body: <>
        <p>You keep the rights you hold in your résumé and other content you provide. By submitting it, you give TalentMatch permission to process it and use the service providers needed to deliver the features you choose. Upload or paste only material you have permission to use, including personal information about other people.</p>
        <p>Choose what to include in each request. Our Privacy Policy explains when application content goes to an AI provider, how tracking works, and how to remove account information. <Link to="/privacy">Read the Privacy Policy</Link>.</p>
      </>,
    },
    {
      id: "generated-content",
      title: "Checking AI-generated work",
      body: <>
        <p>Fit assessments, career suggestions, and drafts can contain errors or overlook relevant experience. A score reflects the materials you provided and cannot predict an employer’s decision. Review each requirement against the original posting.</p>
        <p>Before sending an application, check names, dates, qualifications, and claims of experience against your own records. You decide what to submit and are responsible for the accuracy of the application you send.</p>
      </>,
    },
    {
      id: "employers",
      title: "Listings and employer applications",
      body: <p>Employers control their postings, deadlines, eligibility criteria, and hiring decisions. A listing can change or close between updates. Apply takes you to an external site, where the employer’s terms and privacy policy apply. You complete the submission there. Confirming that you applied updates your personal TalentMatch tracker.</p>,
    },
    {
      id: "acceptable-use",
      title: "Responsible use",
      body: <p>Use TalentMatch lawfully and respect other people’s privacy and intellectual property. Do not use it to impersonate someone, submit false credentials, access another person’s account without permission, distribute harmful files, bypass usage limits, or disrupt the service.</p>,
    },
    {
      id: "availability",
      title: "Service availability and changes",
      body: <p>Job boards, AI tools, and sign-in or email providers can be temporarily unavailable. Features and usage limits can change. Save a copy of any draft you want to keep before closing or refreshing the page. If these terms change, the updated version and date will appear here. Rights you have under applicable law continue to apply.</p>,
    },
    {
      id: "contact",
      title: "Contact",
      body: <p>For questions about these terms or to report a problem with TalentMatch, email An Nguyen at {contactLink}.</p>,
    },
  ],
};

export default function LegalPage({ kind }) {
  const page = kind === "privacy" ? privacy : terms;
  return <main id="main-content" className="tm-legal">
    <header className="tm-legal-header">
      <h1>{page.title}</h1>
      <p>{page.introduction}</p>
      <small>Last updated <time dateTime="2026-11-23">November 23, 2026</time></small>
    </header>
    <div className="tm-legal-layout">
      <nav className="tm-legal-index" aria-label="On this page">
        <h2>On this page</h2>
        <ul>{page.sections.map(section => <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>)}</ul>
      </nav>
      <div className="tm-legal-content">
        {page.sections.map(section => <section key={section.id} aria-labelledby={section.id}>
          <h2 id={section.id}>{section.title}</h2>
          {section.body}
        </section>)}
      </div>
    </div>
  </main>;
}
