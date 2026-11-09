import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import ResumeMatcher from "./ResumeMatcher";
import { AuthProvider, useAuth } from "./AuthContext";
import Signup from "./Signup";
import Login from "./Login";
import ResetPassword from "./ResetPassword";
import RequestPasswordReset from "./RequestPasswordReset";
import NavBar from "./NavBar";
import PublicNavBar from "./PublicNavBar";
import ProfileSettings from "./ProfileSettings.js";
import DashboardPage from "./DashboardPage";
import ContactPage from "./ContactPage";
import HomeIntro from "./HomeIntro";
import { ThemeProvider } from "./ThemeContext";

function RouteScrollReset() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

// Main authenticated content (with app nav bar)
const MainContent = () => {
  const [menu, setMenu] = useState("matcher");
  return (
    <div>
      <NavBar setMenu={setMenu} menu={menu} />
      {/* Use React Router for actual page routing */}
      {menu === "matcher" ? <ResumeMatcher /> : <DashboardPage />}
    </div>
  );
};

// PublicLayout wraps all public pages in the branded nav and background
function PublicLayout({ children, landing = false }) {
  if (landing) {
    return (
      <div className="tm-public-page">
        <PublicNavBar variant="landing" />
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-br from-purple-800 via-purple-500 to-blue-400 relative overflow-hidden">
      <PublicNavBar />
      <div className="w-full flex-1 flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}

// Main app with authentication-aware routing
const App = () => {
  const { user, setAuthData } = useAuth();

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
        <Route
          path="/dashboard/*"
          element={
            <>
              <NavBar setMenu={() => {}} menu="dashboard" />
              <DashboardPage />
            </>
          }
        />
        <Route
          path="/dashboard/settings/*"
          element={
            <>
              <NavBar setMenu={() => {}} menu="dashboard" />
              <ProfileSettings />
            </>
          }
        />
        {/* If logged in and hit /login or /contact, push back to app */}
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/contact" element={<Navigate to="/" replace />} />
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
          <PublicLayout landing>
            <HomeIntro />
          </PublicLayout>
        }
      />

      <Route
        path="/login"
        element={
          <PublicLayout landing>
            <Login />
          </PublicLayout>
        }
      />
      <Route
        path="/signup"
        element={
          <PublicLayout landing>
            <Signup onLogin={handleLogin} />
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
      <Route
        path="/contact"
        element={
          <PublicLayout landing>
            <ContactPage />
          </PublicLayout>
        }
      />
      {/* Any unknown public route → home intro */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

// WrappedApp: root of your app
export default function WrappedApp() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <RouteScrollReset />
          <App />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
