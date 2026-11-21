import React, { Suspense } from "react";
import "./RouteContent.css";

export default function RouteContent({ children }) {
  return <Suspense fallback={<main id="main-content" className="tm-route-loading" aria-busy="true">
    <p role="status">Loading your page…</p>
  </main>}>{children}</Suspense>;
}
