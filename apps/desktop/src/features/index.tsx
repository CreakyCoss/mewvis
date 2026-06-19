import { HashRouter } from "react-router";
import { StartupGate } from "@/features/app/startup";
import {
  WorkspaceDialogHost,
  WorkspaceProvider,
} from "@/features/pages/workspace/provider";
import { AppRoutes } from "@/features/routes";

export const FeatureApp = () => (
  <StartupGate>
    <HashRouter>
      <WorkspaceProvider>
        <AppRoutes />
        <WorkspaceDialogHost />
      </WorkspaceProvider>
    </HashRouter>
  </StartupGate>
);

export default FeatureApp;
