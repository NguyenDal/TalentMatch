import React, { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import NavBar from "../components/navigation/NavBar";
import PublicNavBar from "../components/navigation/PublicNavBar";
import HomeIntro from "../pages/home/HomeIntro";
import { ThemeProvider } from "../contexts/ThemeContext";
import "./RouteContent.css";

// Keep the landing page available immediately; fetch other screens on demand.
const ResumeMatcher = lazy(() => import("../pages/matching/ResumeMatcher"));
const Signup = lazy(() => import("../pages/auth/Signup"));
const Login = lazy(() => import("../pages/auth/Login"));
const ResetPassword = lazy(() => import("../pages/auth/ResetPassword"));
const RequestPasswordReset = lazy(() => import("../pages/auth/RequestPasswordReset"));
const ProfileSettings = lazy(() => import("../pages/settings/ProfileSettings"));
const DashboardPage = lazy(() => import("../pages/dashboard/DashboardPage"));
const ContactPage = lazy(() => import("../pages/contact/ContactPage"));

function RouteContent({ children }) {
  return <Suspense fallback={<main id="main-content" className="tm-route-loading" aria-busy="true">
    <p role="status">Loading your page…</p>
  </main>}>{children}</Suspense>;
}

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
      <RouteContent>{menu === "matcher" ? <ResumeMatcher /> : <DashboardPage />}</RouteContent>
    </div>
  );
};

// PublicLayout wraps all public pages in the branded nav and background
function PublicLayout({ children, landing = false }) {
  if (landing) {
    return (
      <div className="tm-public-page">
        <PublicNavBar variant="landing" />
        <RouteContent>{children}</RouteContent>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-br from-purple-800 via-purple-500 to-blue-400 dark:bg-none dark:bg-[var(--tm-dark-bg)] relative overflow-hidden">
      <PublicNavBar />
      <div className="w-full flex-1 flex items-center justify-center">
        <RouteContent>{children}</RouteContent>
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
      <div className="tm-app-shell">
      <Routes>
        <Route path="/" element={<MainContent />} />
        <Route
          path="/dashboard/*"
          element={
            <>
              <NavBar setMenu={() => {}} menu="dashboard" />
              <RouteContent><DashboardPage /></RouteContent>
            </>
          }
        />
        <Route
          path="/dashboard/settings/*"
          element={
            <>
              <NavBar setMenu={() => {}} menu="dashboard" />
              <RouteContent><ProfileSettings /></RouteContent>
            </>
          }
        />
        {/* If logged in and hit /login or /contact, push back to app */}
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/contact" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </div>
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
