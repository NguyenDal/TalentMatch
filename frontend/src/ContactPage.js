import React from "react";

export default function ContactPage() {
    // Centralized profile data for easy editing
    const info = {
        name: "An Nguyen",
        phone: "782-409-5339",
        email: "annguyen270504@gmail.com",
        linkedin: "https://linkedin.com/in/annguyen270504",
        github: "https://github.com/NguyenDal",
        resume: "https://talentmatch-userfiles.s3.ca-central-1.amazonaws.com/resume/AnNguyen_Resume.pdf", // place the PDF in public/
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
                link: "https://talentmatch-userfiles.s3.ca-central-1.amazonaws.com/resume/Nguyen_s_Resume.pdf",
                desc:
                    "View or download my latest resume.",
            },
        ],
    };

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
                    <div className="font-semibold text-gray-800 mb-2">Get in touch</div>
                    <div className="text-sm text-gray-600">
                        Prefer email?{" "}
                        <a
                            className="text-purple-600 hover:underline"
                            href={`mailto:${info.email}?subject=Opportunity for ${encodeURIComponent(
                                info.name
                            )}&body=Hi ${encodeURIComponent(info.name)},%0D%0A%0D%0A`}
                        >
                            Email me
                        </a>
                        . Or book a quick call via{" "}
                        <a
                            className="text-purple-600 hover:underline"
                            href="https://cal.com/nguyen-an-nguyen-j42hfc/30min"
                            target="_blank"
                            rel="noreferrer"
                        >
                            Cal.com
                        </a>
                        .
                    </div>
                </div>
            </div>
        </div>
    );
}
