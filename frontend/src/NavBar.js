import React from "react";
import { useAuth } from "./AuthContext";
import { useNavigate } from "react-router-dom";

// Dark mode toggle button (globally applies dark mode)
function DarkModeToggle() {
    const [dark, setDark] = React.useState(() => localStorage.getItem("theme") === "dark");

    React.useEffect(() => {
        if (dark) {
            document.documentElement.classList.add("dark");
            localStorage.setItem("theme", "dark");
        } else {
            document.documentElement.classList.remove("dark");
            localStorage.setItem("theme", "light");
        }
    }, [dark]);

    return (
        <button
            aria-label="Toggle dark mode"
            onClick={() => setDark(d => !d)}
            className={`ml-4 flex items-center px-2 py-1 rounded-full border border-blue-300 dark:border-blue-900 transition
        ${dark ? "bg-gray-800 text-blue-200" : "bg-white text-blue-600 hover:bg-blue-50"}
      `}
            style={{ minWidth: 44 }}
        >
            {dark ? (
                // Moon icon
                <svg width={18} height={18} fill="none" viewBox="0 0 24 24">
                    <path d="M21 12.79A9 9 0 0111.21 3a.76.76 0 00-.84.91 7 7 0 007.52 8.58.75.75 0 01.65.73A6.86 6.86 0 0113 20.94a.75.75 0 01-.89-.77V19.5a.75.75 0 01.62-.74A8.99 8.99 0 0021 12.79z" fill="currentColor" />
                </svg>
            ) : (
                // Sun icon
                <svg width={18} height={18} fill="none" viewBox="0 0 24 24">
                    <circle cx={12} cy={12} r={5} fill="currentColor" />
                    <path d="M12 2v2m0 16v2m10-10h-2M4 12H2m15.071-7.071l-1.414 1.414M6.343 17.657l-1.414 1.414M17.657 17.657l-1.414-1.414M6.343 6.343L4.929 4.929" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
            )}
            <span className="ml-1 text-xs">{dark ? "Dark" : "Light"}</span>
        </button>
    );
}

// Main authenticated navigation bar for logged-in users.
export default function NavBar({ setMenu, menu }) {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    return (
        <nav className="w-full bg-blue-600 shadow flex justify-between items-center px-6 py-3 mb-4">
            {/* Left: logo and dark mode */}
            <div className="flex items-center">
                <div className="text-white font-bold text-xl select-none">TalentMatch</div>
                <DarkModeToggle />
            </div>
            {/* Right: nav, username, logout */}
            <div className="flex space-x-4 items-center">
                <button
                    onClick={() => {
                        setMenu && setMenu("matcher");
                        navigate("/");
                    }}
                    className={`px-4 py-2 rounded-lg font-medium ${menu === "matcher"
                        ? "bg-white text-blue-600 shadow"
                        : "text-white hover:bg-blue-700 transition"
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
                            ? "bg-white text-blue-600 shadow"
                            : "text-white hover:bg-blue-700 transition"
                    }`}
                >
                    Dashboard
                </button>
                {user && <span className="text-white ml-6">{user?.username}</span>}
                {user && (
                    <button
                        onClick={logout}
                        className="ml-2 px-4 py-2 rounded-lg font-medium bg-red-100 text-red-700 hover:bg-red-200"
                    >
                        Logout
                    </button>
                )}
            </div>
        </nav>
    );
}