import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../polyfills/pdfjsCompat";
import "../styles/variables.css";
import { EvaluationStudio } from "./EvaluationStudio";

const root = document.getElementById("root");
if (!root) throw new Error("root element is missing");
createRoot(root).render(<StrictMode><EvaluationStudio /></StrictMode>);
