import { SystemFeedback } from "@/workbench/shell/feedback";
import { AppChatIntegration } from "@/workbench/shell/chat-integration";
import { HashRouter } from "react-router";
import { StartupGate } from "@/workbench/shell/startup";
import { AppRoutes } from "@/workbench/routes";

export const Workbench = () => (
  <SystemFeedback>
    <StartupGate>
      <AppChatIntegration>
        <HashRouter>
          <AppRoutes />
        </HashRouter>
      </AppChatIntegration>
    </StartupGate>
  </SystemFeedback>
);

export default Workbench;
