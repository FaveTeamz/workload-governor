import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./tokens.css";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Top-level error boundary — closes #280 */}
    <ErrorBoundary variant="full">
      <App />
    </ErrorBoundary>
  </StrictMode>
);
