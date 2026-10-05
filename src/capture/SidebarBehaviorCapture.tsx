import { useEffect, useRef } from "react";
import { MemoryRouter } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { AppSidebar } from "../components/shell/AppSidebar";
import { useAppStore, type SidebarMode } from "../stores/appStore";
import { useLibraryCache } from "../stores/libraryCache";
import { useProjectStore } from "../stores/projectStore";
import {
  SIDEBAR_CAPTURE_VIEWPORT,
  SIDEBAR_PREVIEW_ACTIVE_NODE_ID,
  SIDEBAR_PREVIEW_COLLAPSED_IDS,
  SIDEBAR_PREVIEW_MEMBERSHIPS,
  SIDEBAR_PREVIEW_PAPERS,
  SIDEBAR_PREVIEW_WORKSPACE,
} from "./sidebarPreviewFixture";
import "../styles/variables.css";

export type SidebarCaptureConfig = {
  mode: SidebarMode;
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

const OUTLINE_ITEMS = [
  "ABSTRACT",
  "Author Keywords",
  "ACM Classification Keywords",
  "導入",
  "JEWELLERY",
  "RELATED WORK",
] as const;

/**
 * Headless capture mount: real AppSidebar + fixture workspace + reader-like chrome.
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
      configure: ({ mode }) => {
        useAppStore.getState().setDisplaySettings({
          sidebarMode: mode,
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
    api.configure({ mode: "auto" });

    return () => {
      delete window.__sidebarCapture;
    };
  }, []);

  return (
    <MemoryRouter initialEntries={[`/project/${SIDEBAR_PREVIEW_ACTIVE_NODE_ID}`]}>
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
          color: "var(--color-text)",
          fontFamily: "var(--font-sans, system-ui, sans-serif)",
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
            activeNodeId={SIDEBAR_PREVIEW_ACTIVE_NODE_ID}
            inboxCount={1}
            showSettings={false}
            initialCollapsedIds={SIDEBAR_PREVIEW_COLLAPSED_IDS}
          />
        </div>

        {/*
          Reader chrome stub: matches production header + outline + title crop
          so Settings GIFs read as the real app, not skeleton bars.
        */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            background: "var(--color-bg)",
          }}
          aria-hidden="true"
        >
          <div
            style={{
              height: 52,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "0 14px",
              borderBottom: "1px solid var(--color-border-light)",
            }}
          >
            <ArrowLeft size={18} color="var(--color-text-secondary)" />
            <div
              style={{
                minWidth: 0,
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: "-0.01em",
              }}
            >
              <span style={{ color: "var(--color-text-tertiary)", fontWeight: 500 }}>
                修士研究
              </span>
              <span style={{ color: "var(--color-text-tertiary)", fontWeight: 400, margin: "0 0.35em" }}>
                /
              </span>
              <span style={{ color: "var(--color-text-tertiary)", fontWeight: 500 }}>
                Interactive jewelry
              </span>
              <span style={{ color: "var(--color-text-tertiary)", fontWeight: 400, margin: "0 0.35em" }}>
                /
              </span>
              <span>インタラクティブジュエリー</span>
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
            <div
              style={{
                width: 168,
                flexShrink: 0,
                padding: "18px 14px",
                borderRight: "1px solid var(--color-border-light)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--color-text-tertiary)",
                  marginBottom: 12,
                }}
              >
                目次
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {OUTLINE_ITEMS.map((label) => (
                  <div
                    key={label}
                    style={{
                      fontSize: 12,
                      lineHeight: 1.3,
                      color: "var(--color-text-tertiary)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {label}
                  </div>
                ))}
              </div>
            </div>

            <main
              style={{
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                padding: "28px 28px 24px",
              }}
            >
              <div
                style={{
                  width: "140%",
                  maxWidth: "none",
                }}
              >
                <h1
                  style={{
                    margin: 0,
                    fontSize: 34,
                    lineHeight: 1.15,
                    fontWeight: 700,
                    letterSpacing: "-0.02em",
                    whiteSpace: "nowrap",
                  }}
                >
                  インタラクティブジュエリー
                </h1>
                <p
                  style={{
                    margin: "10px 0 0",
                    fontSize: 15,
                    color: "var(--color-text-secondary)",
                    whiteSpace: "nowrap",
                  }}
                >
                  Interactive Jewelry
                </p>
                <p
                  style={{
                    margin: "14px 0 0",
                    fontSize: 13,
                    color: "var(--color-text-tertiary)",
                    whiteSpace: "nowrap",
                  }}
                >
                  A. Example · B. Author · C. Researcher
                </p>
                <div
                  style={{
                    marginTop: 22,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      height: 10,
                      width: "92%",
                      borderRadius: 999,
                      background: "var(--color-border-light)",
                    }}
                  />
                  <div
                    style={{
                      height: 10,
                      width: "88%",
                      borderRadius: 999,
                      background: "var(--color-border-light)",
                    }}
                  />
                  <div
                    style={{
                      height: 10,
                      width: "95%",
                      borderRadius: 999,
                      background: "var(--color-border-light)",
                    }}
                  />
                </div>
              </div>
            </main>
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
