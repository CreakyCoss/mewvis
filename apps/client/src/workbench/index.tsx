import { SystemFeedback } from "@/workbench/shell/feedback";
import { AppChatIntegration } from "@/workbench/shell/chat-integration";
import { HashRouter } from "react-router";
import { StartupGate } from "@/workbench/shell/startup";
import { AppRoutes } from "@/workbench/routes";
import { ExtensionHost } from "@/extensions";

export const Workbench = () => (
  <SystemFeedback>
    <StartupGate>
      <ExtensionHost>
        <AppChatIntegration>
          <HashRouter>
            <AppRoutes />
          </HashRouter>
        </AppChatIntegration>
      </ExtensionHost>
    </StartupGate>
  </SystemFeedback>
);

export default Workbench;
