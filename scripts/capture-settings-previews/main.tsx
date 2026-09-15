import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SidebarBehaviorCapture } from "../../src/capture/SidebarBehaviorCapture";

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");

createRoot(root).render(
  <StrictMode>
    <SidebarBehaviorCapture />
  </StrictMode>
);
