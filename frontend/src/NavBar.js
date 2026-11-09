import React from "react";
import { useAuth } from "./AuthContext";
import { useNavigate } from "react-router-dom";

import ThemeToggle from "./ThemeToggle";

// Main authenticated navigation bar for logged-in users.
export default function NavBar({ setMenu, menu }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <nav className="w-full bg-blue-600 dark:bg-gray-900 shadow dark:shadow-lg flex justify-between items-center px-6 py-3 mb-4">
      {/* Left: logo and dark mode */}
      <div className="flex items-center">
        <div className="text-white font-bold text-xl select-none">
          TalentMatch
        </div>
        <ThemeToggle className="tm-theme-toggle--app" />
      </div>

      {/* Right: nav, username, logout */}
      <div className="flex space-x-4 items-center">
        <button
          onClick={() => {
            setMenu && setMenu("matcher");
            navigate("/");
          }}
          className={`px-4 py-2 rounded-lg font-medium ${
            menu === "matcher"
              ? "bg-white text-blue-600 shadow dark:bg-blue-500 dark:text-white"
              : "text-white hover:bg-blue-700 dark:hover:bg-gray-800 transition"
          }`}
        >
          Job Matching
        </button>

        <button
          onClick={() => {
            setMenu && setMenu("dashboard");
            navigate("/dashboard");
          }}
          className={`px-4 py-2 rounded-lg font-medium ${
            menu === "profile" || menu === "dashboard"
              ? "bg-white text-blue-600 shadow dark:bg-blue-500 dark:text-white"
              : "text-white hover:bg-blue-700 dark:hover:bg-gray-800 transition"
          }`}
        >
          Dashboard
        </button>

        {user && <span className="text-white ml-6">{user?.username}</span>}

        {user && (
          <button
            onClick={logout}
            className="ml-2 px-4 py-2 rounded-lg font-medium bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-200 dark:hover:bg-red-800/70"
          >
            Logout
          </button>
        )}
      </div>
    </nav>
  );
}