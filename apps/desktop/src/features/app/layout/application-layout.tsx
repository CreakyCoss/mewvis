import { createContext, useContext, useState, type ReactNode } from "react";
import { useLocation, useMatch } from "react-router";
import { useApplicationCatalogStore } from "@/features/pages/application-ui/catalog-store";

const ApplicationLayoutContext = createContext({
  fullscreen: false,
  canFullscreen: false,
  setFullscreen: (_active: boolean) => {},
});

export const useApplicationLayout = () => useContext(ApplicationLayoutContext);

export const ApplicationLayoutProvider = ({ children }: { children: ReactNode }) => {
  const match = useMatch("/apps/:applicationId");
  const location = useLocation();
  const application = useApplicationCatalogStore((state) =>
    state.catalog.applications.find((item) => item.id === match?.params.applicationId),
  );
  const [dismissed, setDismissed] = useState<string | null>(null);
  const visit = `${location.key}:${application?.id ?? ""}`;
  const canFullscreen = Boolean(
    application && !application.error && !application.uiError && application.ui?.kind === "sandbox" && application.ui.layout === "fullscreen",
  );
  const fullscreen = canFullscreen && dismissed !== visit;

  return (
    <ApplicationLayoutContext.Provider
      value={{ fullscreen, canFullscreen, setFullscreen: (active) => setDismissed(active ? null : visit) }}
    >
      {children}
    </ApplicationLayoutContext.Provider>
  );
};
