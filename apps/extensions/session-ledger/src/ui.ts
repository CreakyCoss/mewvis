import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { definePlugin } from "@isle/extension-host";
import { Ledger } from "./ledger";
import { styles } from "./styles";

export default definePlugin({
  id: "isle.session-ledger",
  protocolVersion: 1,
  mount(container, context) {
    const root = createRoot(container);
    root.render(createElement(Ledger, { context, styles }));
    return () => root.unmount();
  },
});
