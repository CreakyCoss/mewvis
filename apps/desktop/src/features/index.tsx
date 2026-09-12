import { AppChatIntegration } from "@/features/shell/chat-integration";
import { HashRouter } from "react-router";
import { StartupGate } from "@/features/shell/startup";
import { AppRoutes } from "@/features/routes";

export const FeatureApp = () => (
  <StartupGate>
    <AppChatIntegration>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </AppChatIntegration>
  </StartupGate>
);

export default FeatureApp;
