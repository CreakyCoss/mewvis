import { HashRouter } from "react-router";
import { StartupGate } from "@/features/app/startup";
import { AppRoutes } from "@/features/routes";

export const FeatureApp = () => (
  <StartupGate>
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  </StartupGate>
);

export default FeatureApp;
