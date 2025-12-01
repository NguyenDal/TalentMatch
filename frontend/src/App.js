import React, { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ResumeMatcher from "./ResumeMatcher";
import { AuthProvider, useAuth } from "./AuthContext";
import Signup from "./Signup";
import Login from "./Login";
import ResetPassword from "./ResetPassword";
import RequestPasswordReset from "./RequestPasswordReset";
import NavBar from "./NavBar";
import PublicNavBar from "./PublicNavBar";
import SettingsPage from "./SettingsPage.js";
import UserProfile from "./UserProfile";

// Main authenticated content (with app nav bar)
const MainContent = () => {
  const [menu, setMenu] = useState("matcher");
  return (
    <div>
      <NavBar setMenu={setMenu} menu={menu} />
      {/* Use React Router for actual page routing */}
      {menu === "matcher" ? (
        <ResumeMatcher />
      ) : (
        // Route to /profile with subroutes (see below)
        <UserProfile />
      )}
    </div>
  );
};

// PublicLayout wraps all public pages in the branded nav and background
function PublicLayout({ children }) {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-br from-purple-800 via-purple-500 to-blue-400 relative overflow-hidden">
      <PublicNavBar />
      <div className="w-full flex-1 flex items-center justify-center">{children}</div>
    </div>
  );
}

// Main app with authentication-aware routing
const App = () => {
  const { user, setAuthData, login } = useAuth();
  const [showLogin, setShowLogin] = useState(true);

  // Handler for setting auth on signup
  const handleLogin = (data) => {
    setAuthData({
      token: data.access_token,
      email: data.email,
      username: data.username,
    });
  };

  if (user) {
    // Logged in: use React Router for main app, so profile links work!
    return (
      <Routes>
        <Route path="/" element={<MainContent />} />
        <Route path="/profile/*" element={
          <>
            <NavBar setMenu={() => { }} menu="profile" />
            <UserProfile />
          </>
        } />
        <Route path="/profile/settings/*" element={
          <>
            <NavBar setMenu={() => { }} menu="profile" />
            <SettingsPage />
          </>
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  // Not logged in: show public screens with shared purple nav
  return (
    <Routes>
      <Route
        path="/"
        element={
          <PublicLayout>
            <Login onSwitch={() => setShowLogin(false)} onLogin={login} />
          </PublicLayout>
        }
      />
      <Route
        path="/signup"
        element={
          <PublicLayout>
            <Signup onSwitch={() => setShowLogin(true)} onLogin={handleLogin} />
          </PublicLayout>
        }
      />
      <Route
        path="/request-password-reset"
        element={
          <PublicLayout>
            <RequestPasswordReset />
          </PublicLayout>
        }
      />
      <Route
        path="/reset-password"
        element={
          <PublicLayout>
            <ResetPassword />
          </PublicLayout>
        }
      />
      {/* Fallback route */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

// WrappedApp: root of your app
export default function WrappedApp() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AuthProvider>
  );
}