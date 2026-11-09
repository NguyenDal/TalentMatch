import React, { useState, useEffect } from "react";
import axios from "axios";
import { BASE_URL } from "./api";
import { FiLock } from "react-icons/fi";
import { useNavigate } from "react-router-dom";

// Helper to read a query param from URL.
function useQueryParam(param) {
  return new URLSearchParams(window.location.search).get(param);
}

// ResetPassword component handles the new password setting form and UI.
export default function ResetPassword() {
  const token = useQueryParam("token"); // Token from the reset link
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // On load: verify the token with the backend.
  useEffect(() => {
    if (!token) {
      setErr("Invalid or missing reset token.");
      return;
    }
    axios.post(`${BASE_URL}/verify-password-reset/`, new URLSearchParams({ token }))
      .then(res => {
        if (!res.data.ok) setErr("Invalid or expired reset link.");
      })
      .catch(() => setErr("Invalid or expired reset link."));
  }, [token]);

  // Handle password reset form submission.
  const handleReset = async (e) => {
    e.preventDefault();
    setErr("");
    if (!newPassword || !confirmPassword) {
      setErr("Please enter your new password twice.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setErr("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("token", token);
      formData.append("new_password", newPassword);
      const res = await axios.post(`${BASE_URL}/reset-password/`, formData);
      if (res.data.ok) {
        setSuccess(true);
      } else {
        setErr("Could not reset password. Please try again.");
      }
    } catch (error) {
      setErr(
        error.response?.data?.detail ||
        error.message ||
        "Password reset failed. Please try again."
      );
    }
    setLoading(false);
  };

  // If no token or invalid, show error.
  if (!token || err) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-br from-purple-800 via-purple-500 to-blue-400 relative overflow-hidden">
        <div className="flex items-center justify-center w-full min-h-screen">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md px-8 py-10 mt-24 mb-10 relative z-20">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-red-600">Invalid Link</h2>
              <span />
            </div>
            <div className="mb-6 text-gray-700">
              {err || "This password reset link is invalid or missing."}
            </div>
            <button
              onClick={() => navigate("/")}
              className="w-full py-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-lg shadow transition"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Success state: show password reset complete message.
  if (success) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-br from-purple-800 via-purple-500 to-blue-400 relative overflow-hidden">
        <div className="flex items-center justify-center w-full min-h-screen">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md px-8 py-10 mt-24 mb-10 relative z-20">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-green-700">Password Reset!</h2>
              <span />
            </div>
            <div className="mb-6 text-gray-700">
              Your password has been updated. You can now log in with your new password.
            </div>
            <button
              onClick={() => navigate("/")}
              className="w-full py-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-lg shadow transition"
            >
              Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show form to set new password.
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-br from-purple-800 via-purple-500 to-blue-400 relative overflow-hidden">
      {/* Centered reset password card */}
      <div className="flex items-center justify-center w-full min-h-screen">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md px-8 py-10 mt-24 mb-10 relative z-20">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-800">Reset Your Password</h2>
            <span />
          </div>
          <form className="space-y-5" onSubmit={handleReset}>
            <div className="flex items-center border-b border-gray-200 py-2">
              <FiLock className="text-gray-400 mr-2" />
              <input
                type="password"
                placeholder="New Password"
                className="w-full outline-none border-0 bg-transparent px-1 py-2 text-gray-700"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="flex items-center border-b border-gray-200 py-2">
              <FiLock className="text-gray-400 mr-2" />
              <input
                type="password"
                placeholder="Confirm New Password"
                className="w-full outline-none border-0 bg-transparent px-1 py-2 text-gray-700"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            {err && <div className="text-red-500 text-sm">{err}</div>}
            <button
              type="submit"
              className="w-full py-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-lg shadow transition"
              disabled={loading}
            >
              {loading ? "Resetting..." : "Set New Password"}
            </button>
          </form>
          <div className="text-center mt-6 text-gray-500 text-sm">
            Remembered?{" "}
            <button
              onClick={() => navigate("/")}
              className="text-purple-600 font-semibold hover:underline"
              type="button"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}