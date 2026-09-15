import { useEffect, useRef } from "react";
import { MemoryRouter } from "react-router-dom";
import { AppSidebar } from "../components/shell/AppSidebar";
import { useAppStore, type SidebarMode } from "../stores/appStore";
import { useLibraryCache } from "../stores/libraryCache";
import { useProjectStore } from "../stores/projectStore";
import {
  SIDEBAR_CAPTURE_VIEWPORT,
  SIDEBAR_PREVIEW_MEMBERSHIPS,
  SIDEBAR_PREVIEW_PAPERS,
  SIDEBAR_PREVIEW_WORKSPACE,
} from "./sidebarPreviewFixture";
import "../styles/variables.css";

export type SidebarCaptureConfig = {
  mode: SidebarMode;
  rootsOnly: boolean;
};

export type SidebarCaptureApi = {
  configure: (config: SidebarCaptureConfig) => void;
  setPointerOver: (over: boolean) => void;
  getRoot: () => HTMLElement | null;
};

declare global {
  interface Window {
    __sidebarCapture?: SidebarCaptureApi;
  }
}

const noopAsync = async () => undefined;
const noop = () => undefined;

/**
 * Headless capture mount: real AppSidebar + fixture workspace.
 * Playwright drives configure via window.__sidebarCapture.
 */
export function SidebarBehaviorCapture() {
  const shellRef = useRef<HTMLDivElement>(null);
  const sidebarHostRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    useProjectStore.getState().setWorkspaceNodes(SIDEBAR_PREVIEW_WORKSPACE);
    useProjectStore.getState().setMemberships(SIDEBAR_PREVIEW_MEMBERSHIPS);
    useLibraryCache.getState().setPapers(SIDEBAR_PREVIEW_PAPERS);
    document.documentElement.setAttribute("data-theme", "light");

    const api: SidebarCaptureApi = {
      configure: ({ mode, rootsOnly }) => {
        useAppStore.getState().setDisplaySettings({
          sidebarMode: mode,
          sidebarCollapseRootsOnly: rootsOnly,
          theme: "light",
        });
      },
      setPointerOver: (over) => {
        const el = sidebarHostRef.current;
        if (!el) return;
        el.dispatchEvent(
          new PointerEvent(over ? "pointerenter" : "pointerleave", {
            bubbles: true,
            cancelable: true,
            pointerId: 1,
            pointerType: "mouse",
            clientX: over ? 24 : 280,
            clientY: 100,
          })
        );
        el.dispatchEvent(
          new MouseEvent(over ? "mouseenter" : "mouseleave", {
            bubbles: true,
            cancelable: true,
            clientX: over ? 24 : 280,
            clientY: 100,
          })
        );
      },
      getRoot: () => shellRef.current,
    };
    window.__sidebarCapture = api;
    api.configure({ mode: "auto", rootsOnly: true });

    return () => {
      delete window.__sidebarCapture;
    };
  }, []);

  return (
    <MemoryRouter>
      <div
        ref={shellRef}
        data-capture-root
        style={{
          position: "relative",
          width: SIDEBAR_CAPTURE_VIEWPORT.width,
          height: SIDEBAR_CAPTURE_VIEWPORT.height,
          display: "flex",
          overflow: "hidden",
          background: "var(--color-bg)",
        }}
      >
        <div
          ref={(node) => {
            sidebarHostRef.current = node?.querySelector("aside") ?? null;
          }}
          style={{ height: "100%", display: "flex", flexShrink: 0 }}
        >
          <AppSidebar
            workspaceNodes={SIDEBAR_PREVIEW_WORKSPACE}
            searchQuery=""
            onSearchChange={noop}
            onNewWorkspace={noop}
            onNewChild={noop}
            onDeleteNode={noopAsync}
            onAddPaperToWorkspace={noop}
            activeNodeId="ws-root"
            inboxCount={0}
          />
        </div>
        {/*
          Main pane: capsule stubs intentionally wider than the frame so the
          right edge looks like a cropped screenshot of the real reader.
        */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            padding: "24px 0 24px 24px",
            background: "var(--color-bg)",
          }}
          aria-hidden="true"
        >
          <div
            style={{
              /* Wider than the pane so lines are cropped at the frame edge. */
              width: "165%",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div
              style={{
                height: 14,
                width: "58%",
                borderRadius: 999,
                background: "var(--color-border)",
              }}
            />
            <div
              style={{
                height: 9,
                width: "100%",
                borderRadius: 999,
                background: "var(--color-border-light)",
              }}
            />
            <div
              style={{
                height: 9,
                width: "100%",
                borderRadius: 999,
                background: "var(--color-border-light)",
              }}
            />
            <div
              style={{
                height: 9,
                width: "100%",
                borderRadius: 999,
                background: "var(--color-border-light)",
              }}
            />
            <div
              style={{
                height: 9,
                width: "100%",
                borderRadius: 999,
                background: "var(--color-border-light)",
                marginTop: 10,
              }}
            />
            <div
              style={{
                height: 9,
                width: "100%",
                borderRadius: 999,
                background: "var(--color-border-light)",
              }}
            />
          </div>
        </div>
        <div
          id="capture-cursor"
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 300,
            top: 180,
            width: 18,
            height: 24,
            zIndex: 50,
            pointerEvents: "none",
            filter: "drop-shadow(0 1px 1px rgba(0,0,0,.35))",
            transform: "translate(-2px, -2px)",
          }}
        >
          <svg width="18" height="24" viewBox="0 0 18 24">
            <path
              d="M1 1 L1 18 L5.5 14.2 L8.2 21.2 L10.6 20.2 L7.9 13.1 L13.5 12.8 Z"
              fill="#fff"
              stroke="#111"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </MemoryRouter>
  );
}
