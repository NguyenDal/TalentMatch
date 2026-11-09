import React, { useState } from "react";
import axios from "axios";
import { BASE_URL } from "./api";

// This component allows the user to request a password reset link to their email.
export default function RequestPasswordReset() {
  const [email, setEmail] = useState("");
  const [success, setSuccess] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  // Handle form submission to request password reset.
  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("email", email);
      await axios.post(`${BASE_URL}/request-password-reset/`, formData);
      setSuccess(true); // Show success message if request went through.
    } catch (error) {
      setErr(
        error?.response?.data?.detail ||
        error.message ||
        "Could not send reset email. Please try again."
      );
    }
    setLoading(false);
  };

  // Success state: show message to check email.
  if (success) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-br from-purple-800 via-purple-500 to-blue-400 relative overflow-hidden">
        <div className="flex items-center justify-center w-full min-h-screen">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md px-8 py-10 mt-24 mb-10 relative z-20">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-green-700">Check your email!</h2>
              <span />
            </div>
            <div className="mb-6 text-gray-700">
              A password reset link has been sent if the email exists in our records.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Form to request password reset link.
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-br from-purple-800 via-purple-500 to-blue-400 relative overflow-hidden">
      {/* Centered request reset card */}
      <div className="flex items-center justify-center w-full min-h-screen">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md px-8 py-10 mt-24 mb-10 relative z-20">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-800">Forgot your password?</h2>
            <span />
          </div>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="flex items-center border-b border-gray-200 py-2">
              <input
                type="email"
                placeholder="Enter your email address"
                className="w-full outline-none border-0 bg-transparent px-1 py-2 text-gray-700"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            {err && <div className="text-red-500 text-sm">{err}</div>}
            <button
              type="submit"
              className="w-full py-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-lg shadow transition"
              disabled={loading}
            >
              {loading ? "Sending..." : "Send Reset Link"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
