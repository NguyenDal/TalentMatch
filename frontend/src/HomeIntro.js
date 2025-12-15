import React from "react";
import { useNavigate } from "react-router-dom";

export default function HomeIntro() {
  const navigate = useNavigate();

  return (
    // Same gradient background is already applied by PublicLayout,
    // so this is just the centered content card.
    <div className="w-full flex items-center justify-center px-4 py-16 sm:py-24">
      <div className="bg-white/95 rounded-2xl shadow-2xl w-full max-w-5xl px-8 py-10 sm:px-12 sm:py-12 relative z-20">
        {/* Top badge + title */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
              🚀 Resume → Job Matching
            </span>
            <h1 className="mt-3 text-3xl sm:text-4xl font-extrabold text-gray-900">
              Meet <span className="text-purple-600">TalentMatch</span>
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 max-w-xl">
              Upload your resume, paste a job posting, and let TalentMatch do the
              heavy lifting: requirement extraction, match scoring, and smart Q&A
              to help you prepare with confidence.
            </p>
          </div>

          {/* Simple “hero metrics” card */}
          <div className="sm:text-right">
            <div className="text-xs uppercase tracking-wide text-gray-400 font-semibold">
              Built by
            </div>
            <div className="text-base font-semibold text-gray-800">
              An Nguyen
            </div>
            <div className="text-xs text-gray-500">
              Applied CS • Full-stack • AI tools
            </div>
          </div>
        </div>

        {/* Feature grid */}
        <div className="grid gap-4 sm:grid-cols-3 mb-8">
          <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
            <div className="text-sm font-semibold text-gray-900 mb-1">
              🔍 Smart parsing
            </div>
            <div className="text-xs text-gray-600">
              Extracts skills and requirements from your resume and the job
              description using NLP.
            </div>
          </div>
          <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
            <div className="text-sm font-semibold text-gray-900 mb-1">
              📊 Match score
            </div>
            <div className="text-xs text-gray-600">
              Highlights strengths and gaps so you can decide whether to apply
              and what to improve.
            </div>
          </div>
          <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
            <div className="text-sm font-semibold text-gray-900 mb-1">
              💬 AI Q&amp;A
            </div>
            <div className="text-xs text-gray-600">
              Ask questions about the role, your fit, and interview prep based on
              your own resume.
            </div>
          </div>
        </div>

        {/* Call-to-action row */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="px-5 py-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm shadow-lg shadow-purple-500/30 transition"
            >
              Login &amp; start matching
            </button>
            <button
              type="button"
              onClick={() => navigate("/signup")}
              className="px-5 py-3 rounded-lg bg-white text-purple-600 border border-purple-200 hover:bg-purple-50 font-semibold text-sm transition"
            >
              Create an account
            </button>
          </div>

          <button
            type="button"
            onClick={() => navigate("/contact")}
            className="text-xs sm:text-sm text-gray-500 hover:text-purple-600 font-medium underline-offset-4 hover:underline"
          >
            Want to know more about the developer? View portfolio →
          </button>
        </div>
      </div>
    </div>
  );
}