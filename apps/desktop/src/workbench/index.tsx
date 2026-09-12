import { AppChatIntegration } from "@/workbench/shell/chat-integration";
import { HashRouter } from "react-router";
import { StartupGate } from "@/workbench/shell/startup";
import { AppRoutes } from "@/workbench/routes";

export const Workbench = () => (
  <StartupGate>
    <AppChatIntegration>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </AppChatIntegration>
  </StartupGate>
);

export default Workbench;
