import React, { lazy, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import PublicNavBar from "../components/navigation/PublicNavBar";
import PublicFooter from "../components/navigation/PublicFooter";
import HomeIntro from "../pages/home/HomeIntro";
import { ThemeProvider } from "../contexts/ThemeContext";
import RouteContent from "./RouteContent";
import { workspaceTools } from "./workspaceRoutes";
import { publicInfoRoutes } from "./publicInfoRoutes";

// Keep the landing page available immediately; fetch other screens on demand.
const AuthenticatedApp = lazy(() => import("./AuthenticatedApp"));
const Signup = lazy(() => import("../pages/auth/Signup"));
const Login = lazy(() => import("../pages/auth/Login"));
const ResetPassword = lazy(() => import("../pages/auth/ResetPassword"));
const RequestPasswordReset = lazy(() => import("../pages/auth/RequestPasswordReset"));

function RouteScrollReset() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

// PublicLayout wraps all public pages in the branded nav and background
function PublicLayout({ children, landing = false }) {
  if (landing) {
    return (
      <div className="tm-public-page">
        <PublicNavBar variant="landing" />
        <RouteContent>{children}</RouteContent>
        <PublicFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-br from-purple-800 via-purple-500 to-blue-400 dark:bg-none dark:bg-[var(--tm-dark-bg)] relative overflow-hidden">
      <PublicNavBar />
      <div className="w-full flex-1 flex items-center justify-center">
        <RouteContent>{children}</RouteContent>
      </div>
      <PublicFooter />
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
    // Public visits do not download the workspace navbar, menu, or shell styles.
    return <RouteContent><AuthenticatedApp key={user.email || user.username} /></RouteContent>;
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
      <Route element={<PublicLayout landing><Outlet /></PublicLayout>}>{publicInfoRoutes}</Route>
      {/* Any unknown public route → home intro */}
      {workspaceTools.map(({ path }) => <Route key={path} path={path} element={<PublicLayout landing><Login /></PublicLayout>} />)}
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
