import { createRoot } from "react-dom/client";
import { createElement } from "react";
import { defineUIExtension } from "@mewvis/extension-sdk/ui";
import { Editor } from "./editor";

export default defineUIExtension({
  id: "mewvis.decisions",
  apiVersion: 1,
  mount(element, context) {
    const root = createRoot(element);
    root.render(createElement(Editor, { context }));
    return () => root.unmount();
  },
});
