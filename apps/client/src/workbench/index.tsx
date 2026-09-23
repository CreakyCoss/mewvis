import { SystemFeedback } from "@/workbench/shell/feedback";
import { AppChatIntegration } from "@/workbench/shell/chat-integration";
import { HashRouter } from "react-router";
import { StartupGate } from "@/workbench/shell/startup";
import { AppRoutes } from "@/workbench/routes";
import { DialogSlot } from "@isle/extension-host/ui/slots/dialog";
import { PluginUIProvider } from "@isle/extension-host/ui/react";
import { extensionUICatalog, extensionViewTransport } from "@/api/extensions";

export const Workbench = () => (
  <SystemFeedback>
    <StartupGate>
      <PluginUIProvider source={extensionUICatalog} transport={extensionViewTransport}>
        <DialogSlot />
        <AppChatIntegration>
          <HashRouter>
            <AppRoutes />
          </HashRouter>
        </AppChatIntegration>
      </PluginUIProvider>
    </StartupGate>
  </SystemFeedback>
);

export default Workbench;
