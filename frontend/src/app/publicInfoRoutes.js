import React, { lazy } from "react";
import { Route } from "react-router-dom";

const ContactPage = lazy(() => import("../pages/contact/ContactPage"));
const LegalPage = lazy(() => import("../pages/legal/LegalPage"));

export const publicInfoRoutes = <>
  <Route path="/contact" element={<ContactPage />} />
  <Route path="/privacy" element={<LegalPage kind="privacy" />} />
  <Route path="/terms" element={<LegalPage kind="terms" />} />
</>;
