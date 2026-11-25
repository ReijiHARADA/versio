import { createContext, useContext } from "react";

/** True inside the left split pane: papers opened there open in that pane (and its tab group). */
export const SplitPaneContext = createContext(false);
export const useInSplitPane = () => useContext(SplitPaneContext);
