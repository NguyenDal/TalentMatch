import React, { lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import NavBar from "../components/navigation/NavBar";
import PublicFooter from "../components/navigation/PublicFooter";
import { ApplicationMaterialsProvider } from "../contexts/ApplicationMaterials";
import RouteContent from "./RouteContent";
import { workspaceTools } from "./workspaceRoutes";
import { publicInfoRoutes } from "./publicInfoRoutes";

const JobSearch = lazy(() => import("../pages/jobs/JobSearch"));
const ResumeMatcher = lazy(() => import("../pages/matching/ResumeMatcher"));
const ApplicationToolPage = lazy(() => import("../pages/application-tools/ApplicationToolPage"));
const ProfileSettings = lazy(() => import("../pages/settings/ProfileSettings"));

export default function AuthenticatedApp() {
  return <ApplicationMaterialsProvider>
    <div className="tm-app-shell">
      <NavBar />
      <RouteContent>
        <Routes>
          {publicInfoRoutes}
          <Route path="/jobs" element={<JobSearch />} />
          <Route path="/job-fit" element={<ResumeMatcher />} />
          {workspaceTools.filter(item => item.tool).map(({ path, tool }) =>
            <Route key={tool} path={path} element={<ApplicationToolPage key={tool} tool={tool} />} />
          )}
          <Route path="/dashboard/settings/*" element={<ProfileSettings />} />
          <Route path="*" element={<Navigate to="/jobs" replace />} />
        </Routes>
      </RouteContent>
      <PublicFooter />
    </div>
  </ApplicationMaterialsProvider>;
}
