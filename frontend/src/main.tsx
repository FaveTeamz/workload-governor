import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./tokens.css";
import "./i18n";
import App from "./App";
import { ThemeProvider } from "./context/ThemeContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LiveUpdatesProvider } from "./hooks/useLiveUpdates";
import { ToastProvider } from "./components/Toast";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Top-level error boundary — closes #280 */}
    <ErrorBoundary variant="full">
      <BrowserRouter>
        <ToastProvider>
          <LiveUpdatesProvider>
            <ThemeProvider>
              <App />
            </ThemeProvider>
          </LiveUpdatesProvider>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
);
