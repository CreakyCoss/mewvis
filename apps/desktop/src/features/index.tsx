import { AppChatIntegration } from "@/features/app/chat-integration";
import { HashRouter } from "react-router";
import { StartupGate } from "@/features/app/startup";
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
