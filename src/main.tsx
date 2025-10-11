import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Disable StrictMode to prevent double-mounting which causes duplicate backend instances
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);
