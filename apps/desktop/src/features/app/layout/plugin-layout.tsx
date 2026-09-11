import { createContext, useContext, useState, type ReactNode } from "react";
import { useLocation, useMatch } from "react-router";
import { usePluginCatalogStore } from "@/features/pages/plugin-ui/catalog-store";

const PluginLayoutContext = createContext({
  fullscreen: false,
  canFullscreen: false,
  setFullscreen: (_active: boolean) => {},
});

export const usePluginLayout = () => useContext(PluginLayoutContext);

export const PluginLayoutProvider = ({ children }: { children: ReactNode }) => {
  const match = useMatch("/plugins/:pluginId");
  const location = useLocation();
  const plugin = usePluginCatalogStore((state) =>
    state.catalog.plugins.find((item) => item.id === match?.params.pluginId),
  );
  const [dismissed, setDismissed] = useState<string | null>(null);
  const visit = `${location.key}:${plugin?.id ?? ""}`;
  const canFullscreen = Boolean(
    plugin && !plugin.error && !plugin.uiError && plugin.ui?.kind === "sandbox" && plugin.ui.layout === "fullscreen",
  );
  const fullscreen = canFullscreen && dismissed !== visit;

  return (
    <PluginLayoutContext.Provider
      value={{ fullscreen, canFullscreen, setFullscreen: (active) => setDismissed(active ? null : visit) }}
    >
      {children}
    </PluginLayoutContext.Provider>
  );
};
