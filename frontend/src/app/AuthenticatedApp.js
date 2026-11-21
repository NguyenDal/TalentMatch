import React, { lazy, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import NavBar from "../components/navigation/NavBar";
import RouteContent from "./RouteContent";

const ResumeMatcher = lazy(() => import("../pages/matching/ResumeMatcher"));
const DashboardPage = lazy(() => import("../pages/dashboard/DashboardPage"));
const ProfileSettings = lazy(() => import("../pages/settings/ProfileSettings"));

function MainContent() {
  const [menu, setMenu] = useState("matcher");
  return (
    <div>
      <NavBar setMenu={setMenu} menu={menu} />
      <RouteContent>{menu === "matcher" ? <ResumeMatcher /> : <DashboardPage />}</RouteContent>
    </div>
  );
}

export default function AuthenticatedApp() {
  return (
    <div className="tm-app-shell">
      <Routes>
        <Route path="/" element={<MainContent />} />
        <Route path="/dashboard/*" element={
          <>
            <NavBar setMenu={() => {}} menu="dashboard" />
            <RouteContent><DashboardPage /></RouteContent>
          </>
        } />
        <Route path="/dashboard/settings/*" element={
          <>
            <NavBar setMenu={() => {}} menu="dashboard" />
            <RouteContent><ProfileSettings /></RouteContent>
          </>
        } />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/contact" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
