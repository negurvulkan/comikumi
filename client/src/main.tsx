import React from "react";
import ReactDOM from "react-dom/client";
import { createHashRouter, Navigate, RouterProvider } from "react-router-dom";
import "./i18n";
import App from "./App";
import "./index.css";

/**
 * Every route below `/` is its own code-split chunk (React Router's data-router
 * `lazy` field — https://reactrouter.com/start/data/route-object#lazy) instead of a
 * static top-level import. Only `App` (the always-visible shell: header, project
 * context, sidebar chrome) needs to be in the initial bundle; a translator opening
 * the app to letter one page has no reason to also download the Script Editor,
 * Admin Dashboard, Story Bible, etc. up front. Each `.then(m => ({ Component: m.X }))`
 * matches the named export every route file already uses (see main.tsx's previous
 * static imports) — React Router's data router reads `Component` off the resolved
 * module, no default-export convention needed.
 */
// Rendered instead of `element` for the very first paint whenever the initially
// matched route tree includes a `lazy` entry (e.g. a hard refresh / deep link
// straight into "/p/x/volumes/y/pages/z") — React Router requires SOME ancestor
// route to provide this once any descendant uses `lazy`, otherwise it warns and
// silently renders nothing during that window. Deliberately plain/unstyled text
// with no i18n/context dependency: this can render before SessionProvider/
// ProjectProvider (which normally live inside `element: <App/>`) has mounted.
function HydrateFallback() {
  return <div style={{ padding: 24, color: "#8a8fa3" }}>Loading…</div>;
}

const router = createHashRouter([
  {
    path: "/",
    element: <App />,
    HydrateFallback,
    children: [
      { index: true, element: <Navigate to="/project" replace /> },
      { path: "login", lazy: () => import("./routes/Login").then((m) => ({ Component: m.Login })) },
      { path: "setup", lazy: () => import("./routes/Setup").then((m) => ({ Component: m.Setup })) },
      { path: "project", lazy: () => import("./routes/ProjectSwitcher").then((m) => ({ Component: m.ProjectSwitcher })) },
      { path: "project/new", lazy: () => import("./routes/ProjectWizard").then((m) => ({ Component: m.ProjectWizard })) },
      { path: "admin", lazy: () => import("./routes/AdminDashboard").then((m) => ({ Component: m.AdminDashboard })) },
      { path: "account", lazy: () => import("./routes/AccountSettings").then((m) => ({ Component: m.AccountSettings })) },
      {
        // No element — React Router renders an implicit <Outlet/> for a layout route
        // with children and no element of its own. The actual project-context wiring
        // (ambient id + fetched project data) lives in App.tsx's ProjectProvider,
        // which wraps the whole shell (header included), not just this subtree — see
        // ProjectContext.tsx's doc comment for why.
        path: "p/:projectId",
        children: [
          { index: true, lazy: () => import("./routes/VolumeList").then((m) => ({ Component: m.VolumeList })) },
          { path: "settings", lazy: () => import("./routes/Settings").then((m) => ({ Component: m.Settings })) },
          { path: "story-bible", lazy: () => import("./routes/StoryBible").then((m) => ({ Component: m.StoryBible })) },
          { path: "volumes/:volumeId", lazy: () => import("./routes/PageGrid").then((m) => ({ Component: m.PageGrid })) },
          { path: "volumes/:volumeId/script", lazy: () => import("./routes/ScriptEditor").then((m) => ({ Component: m.ScriptEditor })) },
          { path: "volumes/:volumeId/exports", lazy: () => import("./routes/ExportViewer").then((m) => ({ Component: m.ExportViewer })) },
          { path: "volumes/:volumeId/workflow", lazy: () => import("./routes/WorkflowBoard").then((m) => ({ Component: m.WorkflowBoard })) },
          { path: "volumes/:volumeId/pages/:page", lazy: () => import("./routes/Editor").then((m) => ({ Component: m.Editor })) },
          { path: "volumes/:volumeId/read/:page", lazy: () => import("./routes/Reader").then((m) => ({ Component: m.Reader })) },
        ],
      },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
