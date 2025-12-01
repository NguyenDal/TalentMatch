import React, { useState } from "react";
import axios from "axios";
import { BASE_URL } from "./api";

// ResumeMatcher component handles the resume-job matching functionality.
const ResumeMatcher = () => {
  // === State variables ===
  const [resumeFile, setResumeFile] = useState(null);   // Stores the uploaded resume file.
  const [jobDesc, setJobDesc] = useState("");           // Stores the pasted job description.
  const [result, setResult] = useState(null);           // Stores the result returned from the backend.
  const [loading, setLoading] = useState(false);        // Indicates whether the matching process is in progress.
  const [expandedReq, setExpandedReq] = useState(null); // Tracks which requirement is expanded for details.
  const [userMet, setUserMet] = useState([]);           // Tracks requirements manually marked as "met" by the user.
  const [userMissing, setUserMissing] = useState([]);   // Tracks requirements manually marked as "missing" by the user.

  // === Calculate matching logic for UI scoring ===
  const originalMet = result?.met_requirements || [];   // Requirements initially marked as "met" by the backend.
  const originalMissing = result?.missing_requirements || []; // Requirements initially marked as "missing" by the backend.

  // Combine backend results with user overrides for "met" and "missing" requirements.
  const effectiveMet = [
    ...originalMet,
    ...userMet.filter(req => !originalMet.includes(req)),
  ].filter(req => !userMissing.includes(req));
  const effectiveMissing = [
    ...originalMissing,
    ...userMissing.filter(req => !originalMissing.includes(req)),
  ].filter(req => !userMet.includes(req));

  // Calculate the total number of requirements and the percentage of requirements met.
  const allRequirements = [...originalMet, ...originalMissing].filter(
    (v, i, a) => a.indexOf(v) === i
  );
  const requirementsMetCount = effectiveMet.length;
  const requirementsTotal = allRequirements.length;
  const requirementsMetScore =
    requirementsTotal > 0
      ? ((requirementsMetCount / requirementsTotal) * 100).toFixed(1)
      : "N/A";

  // === Renders each requirement as a card/box ===
  const renderRequirementBox = (req, isMet) => (
    <div
      key={req}
      className={`border ${isMet
        ? "border-green-400 bg-green-50 text-green-900"
        : "border-red-400 bg-red-50 text-red-900"
        } rounded-lg px-5 py-3 font-medium transition-all mb-2`}
    >
      {/* Button to toggle the expanded view of the requirement */}
      <button
        className="w-full text-left font-medium focus:outline-none"
        onClick={() => setExpandedReq(expandedReq === req ? null : req)}
      >
        {req}
      </button>
      {/* Expanded view showing additional details about the requirement */}
      {expandedReq === req && (
        <div
          className={`px-2 pb-2 pt-1 text-gray-800 text-base leading-relaxed ${isMet
            ? "bg-green-50 border-t border-green-200"
            : "bg-red-50 border-t border-red-200"
            } rounded-b-lg`}
        >
          <div className="mb-2 font-normal">
            {result.requirement_explanations?.[req] || "Loading explanation..."}
          </div>
          <div className="flex gap-2 mt-1">
            {/* Button to mark the requirement as "met" */}
            <button
              className="px-3 py-1 rounded bg-green-200 text-green-800 hover:bg-green-300 font-semibold"
              onClick={() => {
                setUserMet(prev => Array.from(new Set([...prev, req])));
                setUserMissing(prev => prev.filter(x => x !== req));
                setExpandedReq(null);
              }}
            >
              Yes, I meet this
            </button>
            {/* Button to mark the requirement as "missing" */}
            <button
              className="px-3 py-1 rounded bg-red-200 text-red-800 hover:bg-red-300 font-semibold"
              onClick={() => {
                setUserMissing(prev => Array.from(new Set([...prev, req])));
                setUserMet(prev => prev.filter(x => x !== req));
                setExpandedReq(null);
              }}
            >
              No, I don’t
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // === Handle file input change ===
  const handleFileChange = (e) => {
    setResumeFile(e.target.files[0]); // Update the resume file state.
    setResult(null);                 // Clear previous results.
    setUserMet([]);                  // Reset user overrides for "met" requirements.
    setUserMissing([]);              // Reset user overrides for "missing" requirements.
  };

  // === Handle job description input change ===
  const handleJobDescChange = (e) => {
    setJobDesc(e.target.value);      // Update the job description state.
    setResult(null);                 // Clear previous results.
    setUserMet([]);                  // Reset user overrides for "met" requirements.
    setUserMissing([]);              // Reset user overrides for "missing" requirements.
  };

  // === Main form submit handler ===
  const handleSubmit = async (e) => {
    e.preventDefault(); // Prevent the default form submission behavior.
    if (!resumeFile || !jobDesc) {
      alert("Please upload your resume and paste the job description."); // Alert if inputs are missing.
      return;
    }
    setLoading(true); // Set loading state to true while processing the request.
    const formData = new FormData();
    formData.append("resume", resumeFile); // Append the resume file to the form data.
    formData.append("job_description", jobDesc); // Append the job description to the form data.

    try {
      // Send the form data to the backend for processing.
      const res = await axios.post(`${BASE_URL}/upload-resume/`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(res.data); // Update the result state with the backend response.
      setUserMet([]);      // Reset user overrides for "met" requirements.
      setUserMissing([]);  // Reset user overrides for "missing" requirements.
    } catch (err) {
      // Handle errors during the request.
      setResult({ error: "There was a problem processing your request." });
    } finally {
      setLoading(false); // Reset the loading state.
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-100 to-purple-200 py-10">
      {/* Main container for the Resume Matcher */}
      <div
        className="bg-white rounded-2xl shadow-2xl px-10 py-14 sm:px-20 sm:py-16 max-w-6xl w-full mb-40 transition-all duration-200 relative"
        style={{ minHeight: "500px" }}
      >
        <h1 className="text-4xl font-bold text-center text-blue-600 mb-2">Resume Job Matching</h1>
        <h2 className="text-xl text-center text-gray-700 mb-8">AI-Powered Fit Analysis &amp; Q&amp;A</h2>
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* === Resume Upload Section === */}
          <div>
            <label className="block font-semibold text-gray-700 mb-1 text-base">
              Upload your Resume <span className="text-xs text-gray-500">(.pdf, .docx, .txt)</span>:
            </label>
            <input
              type="file"
              accept=".pdf,.docx,.txt" // Accept specific file types.
              onChange={handleFileChange}
              className="block w-full text-base text-gray-600
                file:mr-4 file:py-2 file:px-4
                file:rounded-lg file:border-0
                file:text-base file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100
              "
            />
          </div>
          {/* === Job Description Paste Section === */}
          <div>
            <label className="block font-semibold text-gray-700 mb-1 text-base">
              Paste Job Description:
            </label>
            <textarea
              rows={7}
              value={jobDesc}
              onChange={handleJobDescChange}
              placeholder="Paste the job description here..."
              className="w-full p-4 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-300 resize-vertical text-base"
              required
              style={{ minHeight: "120px" }}
            />
          </div>
          {/* Submit Button */}
          <button
            type="submit"
            className="w-full py-4 px-4 bg-blue-600 hover:bg-blue-700 text-white text-lg font-bold rounded-lg shadow transition disabled:opacity-70 disabled:cursor-not-allowed"
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block h-5 w-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                Checking...
              </span>
            ) : (
              "Check Match"
            )}
          </button>
        </form>
        {/* === Display Result Section === */}
        {result && (
          <div className="mt-10 p-8 bg-blue-50 rounded-xl border border-blue-200 text-blue-800">
            {result.error ? (
              // Display error message if the backend returns an error.
              <div className="text-red-500">{result.error}</div>
            ) : (
              <>
                {/* Display Match Score */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
                  <div className="mb-2 md:mb-0">
                    <span className="font-semibold text-lg">Match Score:</span>{" "}
                    <span className="text-3xl font-extrabold text-green-700">{requirementsMetScore}%</span>
                    <span className="ml-2 text-base text-gray-500">
                      ({requirementsMetCount} of {requirementsTotal})
                    </span>
                  </div>
                  {/* Progress Bar */}
                  <div className="w-full md:w-96 mt-2 md:mt-0">
                    <div className="h-3 bg-gray-200 rounded-full">
                      <div
                        className="h-3 bg-blue-400 rounded-full"
                        style={{
                          width: `${requirementsTotal > 0
                            ? (requirementsMetCount / requirementsTotal) * 100
                            : 0
                            }%`
                        }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* Display Requirements */}
                <div>
                  <div className="font-semibold text-green-700 mb-2 text-lg">You meet these:</div>
                  {effectiveMet.length === 0 && <div className="text-xs text-gray-400 mb-2">None yet</div>}
                  {effectiveMet.map((req) => renderRequirementBox(req, true))}
                  <div className="font-semibold text-red-700 mb-2 text-lg mt-6">Missing requirements:</div>
                  {effectiveMissing.length === 0 && <div className="text-xs text-gray-400 mb-2">None!</div>}
                  {effectiveMissing.map((req) => renderRequirementBox(req, false))}
                </div>

                {/* Display AI Suggestions */}
                {Array.isArray(result.ai_suggestions) && result.ai_suggestions.length > 0 && (
                  <>
                    <div className="font-semibold text-blue-700 mt-8 mb-3 text-lg">Helpful Application Q&amp;A:</div>
                    <div className="flex flex-col gap-2">
                      {result.ai_suggestions.map((q, idx) => (
                        <div key={idx} className="border border-blue-300 rounded-lg bg-white">
                          <button
                            type="button"
                            className="w-full text-left p-3 font-medium text-blue-600 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-200 rounded-t-lg transition"
                            onClick={() => setExpandedReq(expandedReq === "ai_" + idx ? null : "ai_" + idx)}
                          >
                            {q.question}
                          </button>
                          {expandedReq === "ai_" + idx && (
                            <div className="px-4 pb-4 pt-1 text-gray-800 bg-blue-50 rounded-b-lg border-t border-blue-200">
                              {q.answer}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}
        {/* Footer */}
        <div className="mt-10 text-center text-gray-400 text-xs">Resume Matcher © 2025</div>
      </div>
    </div>
  );
};

export default ResumeMatcher;
