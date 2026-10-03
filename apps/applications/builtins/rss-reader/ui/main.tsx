import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

const root = document.createElement("div");
root.id = "rss-root";
document.body.append(root);
createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
