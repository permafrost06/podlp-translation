import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexProvider } from "convex/react";
import App from "./App";
import { convex } from "./lib/api";
import { ThemeProvider } from "./components/theme-provider";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConvexProvider client={convex}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </ConvexProvider>
  </React.StrictMode>
);
