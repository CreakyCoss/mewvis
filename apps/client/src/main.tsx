import React from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import App from "./App";

const app = (
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

const rootElement = document.getElementById("root") as HTMLElement;

if (rootElement.firstElementChild) {
  const startupElement = rootElement.firstElementChild;
  const removeWhitespaceTextNodes = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE && !child.textContent?.trim()) {
        child.remove();
        continue;
      }

      removeWhitespaceTextNodes(child);
    }
  };

  removeWhitespaceTextNodes(startupElement);
  rootElement.replaceChildren(startupElement);
  hydrateRoot(rootElement, app);
} else {
  createRoot(rootElement).render(app);
}
