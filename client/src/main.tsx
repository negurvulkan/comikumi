import React from "react";
import ReactDOM from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";
import "./i18n";
import App from "./App";
import { VolumeList } from "./routes/VolumeList";
import { PageGrid } from "./routes/PageGrid";
import { Editor } from "./routes/Editor";
import { Settings } from "./routes/Settings";
import { ProjectSwitcher } from "./routes/ProjectSwitcher";
import "./index.css";

const router = createHashRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <VolumeList /> },
      { path: "project", element: <ProjectSwitcher /> },
      { path: "settings", element: <Settings /> },
      { path: "volumes/:volumeId", element: <PageGrid /> },
      { path: "volumes/:volumeId/pages/:page", element: <Editor /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
