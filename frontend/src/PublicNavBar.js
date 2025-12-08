import React from "react";
import { useNavigate } from "react-router-dom";
import { FiGithub, FiLinkedin } from "react-icons/fi";

// Public navigation bar for unauthenticated users.
export default function PublicNavBar() {
  const navigate = useNavigate();
  return (
    <header className="absolute top-0 left-0 w-full px-8 py-5 flex justify-between items-center z-10">
      <div className="text-white text-2xl font-bold tracking-tight">TalentMatch</div>

      <nav className="space-x-8 hidden md:flex items-center">
        <button className="text-white hover:text-purple-200 transition" onClick={() => navigate("/")}>
          Home
        </button>
        <a
          className="inline-flex items-center text-white hover:text-purple-200 transition"
          href="https://github.com/NguyenDal"
          target="_blank" rel="noreferrer"
          title="GitHub"
        >
          <FiGithub className="mr-1" /> GitHub
        </a>
        <a
          className="inline-flex items-center text-white hover:text-purple-200 transition"
          href="https://linkedin.com/in/annguyen270504"
          target="_blank" rel="noreferrer"
          title="LinkedIn"
        >
          <FiLinkedin className="mr-1" /> LinkedIn
        </a>
        <button className="text-white hover:text-purple-200 transition" onClick={() => navigate("/contact")}>
          Contact/Portfolio
        </button>
      </nav>

      <div className="hidden md:flex items-center gap-3">
        <button
          className="border border-white text-white px-5 py-2 rounded hover:bg-white hover:text-purple-700 font-medium transition"
          onClick={() => navigate("/")}
        >
          Login
        </button>
      </div>
    </header>
  );
}

