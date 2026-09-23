import { SystemFeedback } from "@/workbench/shell/feedback";
import { AppChatIntegration } from "@/workbench/shell/chat-integration";
import { HashRouter } from "react-router";
import { StartupGate } from "@/workbench/shell/startup";
import { AppRoutes } from "@/workbench/routes";
import { DialogSlot } from "@isle/extension-host/ui/slots/dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "design-system/components/ui/dialog";
import { PluginUIProvider } from "@isle/extension-host/ui/react";
import { extensionUICatalog, extensionViewTransport } from "@/api/extensions";

export const Workbench = () => (
  <SystemFeedback>
    <StartupGate>
      <PluginUIProvider source={extensionUICatalog} transport={extensionViewTransport}>
        <DialogSlot render={(item) => (
          <Dialog open onOpenChange={(open) => { if (!open) item.close(); }}>
            <DialogContent
              aria-describedby={undefined}
              onCloseAutoFocus={(event) => event.preventDefault()}
              className={`!flex flex-col gap-0 overflow-hidden p-0 ${
                item.size === "lg" ? "h-[min(780px,86vh)] sm:max-w-4xl lg:max-w-5xl" : item.size === "md" ? "h-[min(520px,78vh)] sm:max-w-2xl" : "h-[min(420px,75vh)] sm:max-w-md"
              }`}
            >
              <DialogHeader className="shrink-0 border-b border-border/60 bg-surface-raised/85 px-5 py-5 pr-16">
                <DialogTitle>{item.title}</DialogTitle>
              </DialogHeader>
              {item.renderView()}
            </DialogContent>
          </Dialog>
        )} />
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
