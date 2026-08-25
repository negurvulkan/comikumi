import React from "react";
import ReactDOM from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";
import "./i18n";
import App from "./App";
import { VolumeList } from "./routes/VolumeList";
import { PageGrid } from "./routes/PageGrid";
import { Editor } from "./routes/Editor";
import { Reader } from "./routes/Reader";
import { ScriptEditor } from "./routes/ScriptEditor";
import { Settings } from "./routes/Settings";
import { ProjectSwitcher } from "./routes/ProjectSwitcher";
import { ProjectWizard } from "./routes/ProjectWizard";
import { Login } from "./routes/Login";
import { Setup } from "./routes/Setup";
import { AdminDashboard } from "./routes/AdminDashboard";
import { ExportViewer } from "./routes/ExportViewer";
import "./index.css";

const router = createHashRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <VolumeList /> },
      { path: "login", element: <Login /> },
      { path: "setup", element: <Setup /> },
      { path: "project", element: <ProjectSwitcher /> },
      { path: "project/new", element: <ProjectWizard /> },
      { path: "settings", element: <Settings /> },
      { path: "admin", element: <AdminDashboard /> },
      { path: "volumes/:volumeId", element: <PageGrid /> },
      { path: "volumes/:volumeId/script", element: <ScriptEditor /> },
      { path: "volumes/:volumeId/exports", element: <ExportViewer /> },
      { path: "volumes/:volumeId/pages/:page", element: <Editor /> },
      { path: "volumes/:volumeId/read/:page", element: <Reader /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
