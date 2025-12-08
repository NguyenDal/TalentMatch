import React from "react";
// CHANGE:
// - Added icons for the new 3 contact options (Email / Book a call / WhatsApp)
// - Using react-icons keeps it lightweight and consistent with LinkedIn/GitHub style.
import { FaEnvelope, FaWhatsapp, FaCalendarCheck } from "react-icons/fa";

export default function ContactPage() {
    // Centralized profile data for easy editing
    const info = {
        name: "An Nguyen",

        // CHANGE:
        // - Added country code so people outside Canada can contact easily.
        // - Keep this as digits with leading +.
        countryCode: "+1",

        phone: "782-409-5339",
        email: "annguyen270504@gmail.com",
        linkedin: "https://linkedin.com/in/annguyen270504",
        github: "https://github.com/NguyenDal",
        resume: "https://talentmatch-userfiles.s3.ca-central-1.amazonaws.com/resume/Nguyen_s_Resume.pdf", // place the PDF in public/
        blurb:
            "Applied CS graduate passionate about full-stack development, AI, and developer tooling. Building TalentMatch.",
        skills: [
            "React",
            "FastAPI",
            "Python",
            "Java",
            "Node.js",
            "PostgreSQL",
            "AWS S3",
            "Tailwind CSS",
            "Unity/C#",
            "MySQL",
        ],
        projects: [
            {
                title: "TalentMatch",
                stack: "React • FastAPI • PostgreSQL • AWS S3",
                link: "https://github.com/NguyenDal/TalentMatch", // replace with repo/demo
                desc:
                    "Resume → Job Description matcher with AI-powered requirement extraction, match scoring, and Q&A.",
            },
            {
                title: "GAMBIT (BCI + Unity)",
                stack: "Unity • C# • Arduino",
                link: "https://github.com/NguyenDal/GAMBIT",
                desc:
                    "Technical direction and integration of Arduino Bluetooth controller with Unity; improved BCI UX.",
            },
            {
                title: "Dalhousie Chess Club Website",
                stack: "React • Node.js • MySQL",
                link: "https://github.com/NguyenDal/Dalhousie-Chess-Club",
                desc:
                    "Production site with real-time updates, CORS fixes, server deploy, and 40% backend perf gains.",
            },

            {
                title: "Resume",
                stack: "PDF • Updated",
                // CHANGE:
                // - Point this to info.resume so you only update the URL in ONE place.
                link: "https://talentmatch-userfiles.s3.ca-central-1.amazonaws.com/resume/Nguyen_s_Resume.pdf",
                desc:
                    "View or download my latest resume.",
            },
        ],
    };

    // CHANGE:
    // - Normalize phone to an international E.164-like number for one-click contact.
    const phoneDigits = info.phone.replace(/[^0-9]/g, "");
    const countryDigits = info.countryCode.replace(/[^0-9]/g, "");
    const phoneE164 = `${info.countryCode}${phoneDigits}`;
    const phoneE164DigitsOnly = `${countryDigits}${phoneDigits}`;

    // CHANGE:
    // - Centralized CTA links for the new three-card contact UI.
    // - This keeps JSX cleaner and makes future edits easier.
    const emailHref = `mailto:${info.email}?subject=Opportunity for ${encodeURIComponent(
        info.name
    )}&body=Hi ${encodeURIComponent(info.name)},%0D%0A%0D%0A`;

    const calHref = "https://cal.com/nguyen-an-nguyen-j42hfc/30min";

    // CHANGE:
    // - WhatsApp deep link now uses country code + number.
    // - wa.me requires digits only (no +, no spaces).
    const whatsappHref = `https://wa.me/${phoneE164DigitsOnly}?text=${encodeURIComponent(
        `Hi ${info.name}, I’d love to connect about an opportunity.`
    )}`;

    // CHANGE:
    // - Optional: phone "tel:" link in case you want to reuse it later.
    // - Not used in UI here, but kept for convenience.
    const telHref = `tel:${phoneE164}`;

    return (
        // Full-page gradient background with spacing that accounts for the top navbar
        <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-br from-purple-800 via-purple-500 to-blue-400 relative overflow-hidden pt-28 pb-16 px-6">
            {/* Main card container */}
            <div className="w-full max-w-5xl bg-white/95 backdrop-blur rounded-2xl shadow-xl p-8 sm:p-12">
                {/* Header section with name, blurb, and skills */}
                <div className="flex flex-col gap-6 mb-8">
                    <div>
                        {/* Name */}
                        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900">
                            {info.name}
                        </h1>

                        {/* Blurb */}
                        <p className="text-gray-600 mt-2 lg:whitespace-nowrap">
                            {info.blurb}
                        </p>

                        {/* Skills pills */}
                        <div className="flex flex-wrap gap-2 mt-3">
                            {info.skills.map((s) => (
                                <span
                                    key={s}
                                    className="px-2.5 py-1 text-xs rounded-full bg-purple-50 text-purple-700 border border-purple-100"
                                >
                                    {s}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Projects grid */}
                <div className="grid sm:grid-cols-2 gap-6 mb-8">
                    {info.projects.map((p) => (
                        <a
                            key={p.title}
                            href={p.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block group rounded-xl border border-gray-100 hover:border-purple-200 shadow-sm hover:shadow-md transition bg-white p-5"
                        >
                            {/* Project title */}
                            <div className="font-bold text-gray-900 group-hover:text-purple-700">
                                {p.title}
                            </div>

                            {/* Tech stack */}
                            <div className="text-xs text-gray-500 mt-0.5">{p.stack}</div>

                            {/* Description */}
                            <div className="text-gray-700 text-sm mt-2">{p.desc}</div>

                            {/* CTA */}
                            <div className="text-purple-600 text-sm mt-3">
                                View project →
                            </div>
                        </a>
                    ))}
                </div>

                {/* Contact section */}
                <div className="rounded-xl border border-gray-100 p-5 bg-gray-50">
                    <div className="font-semibold text-gray-800 mb-4">Get in touch</div>

                    <div className="grid gap-4 sm:grid-cols-3">
                        {/* Email card */}
                        <a
                            href={emailHref}
                            className="block group rounded-xl border border-gray-100 hover:border-purple-200 shadow-sm hover:shadow-md transition bg-white p-5"
                        >
                            <div className="flex items-center gap-3">
                                <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-purple-50 text-purple-700 border border-purple-100">
                                    <FaEnvelope />
                                </span>
                                <div className="font-bold text-gray-900 group-hover:text-purple-700">
                                    Email
                                </div>
                            </div>
                            <div className="text-xs text-gray-500 mt-2">
                                Best for detailed opportunities
                            </div>
                            <div className="text-gray-700 text-sm mt-2">
                                {info.email}
                            </div>
                            <div className="text-purple-600 text-sm mt-3">
                                Send an email →
                            </div>
                        </a>

                        {/* Book a call card */}
                        <a
                            href={calHref}
                            target="_blank"
                            rel="noreferrer"
                            className="block group rounded-xl border border-gray-100 hover:border-purple-200 shadow-sm hover:shadow-md transition bg-white p-5"
                        >
                            <div className="flex items-center gap-3">
                                <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-purple-50 text-purple-700 border border-purple-100">
                                    <FaCalendarCheck />
                                </span>
                                <div className="font-bold text-gray-900 group-hover:text-purple-700">
                                    Book a call
                                </div>
                            </div>
                            <div className="text-xs text-gray-500 mt-2">
                                Quick 30-min chat
                            </div>
                            <div className="text-gray-700 text-sm mt-2">
                                Schedule directly via Cal.com
                            </div>
                            <div className="text-purple-600 text-sm mt-3">
                                Pick a time →
                            </div>
                        </a>

                        {/* WhatsApp card */}
                        <a
                            href={whatsappHref}
                            target="_blank"
                            rel="noreferrer"
                            className="block group rounded-xl border border-gray-100 hover:border-purple-200 shadow-sm hover:shadow-md transition bg-white p-5"
                        >
                            <div className="flex items-center gap-3">
                                <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-purple-50 text-purple-700 border border-purple-100">
                                    <FaWhatsapp />
                                </span>
                                <div className="font-bold text-gray-900 group-hover:text-purple-700">
                                    WhatsApp
                                </div>
                            </div>
                            <div className="text-xs text-gray-500 mt-2">
                                Fast, informal updates
                            </div>
                            <div className="text-gray-700 text-sm mt-2">
                                {/* 
                                    CHANGE:
                                    - Display with country code to avoid confusion for international visitors.
                                */}
                                Message me at <span className="font-medium">{phoneE164}</span>
                            </div>
                            <div className="text-purple-600 text-sm mt-3">
                                Start chat →
                            </div>
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}