import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ExtensionSlotProvider } from "../slots/index";
import { bindUIContributions } from "./contributions";
import { ViewTransportContext } from "../views/transport-context";
import { DialogRuntimeProvider } from "./dialog-context";
import { observeUICatalog } from "./catalog";
import type {
  ExtensionUICatalogSource,
  ExtensionUICatalogState,
} from "../protocol/catalog";
import type { ExtensionViewTransport } from "../protocol/transport";

export type { ExtensionUICatalogSource } from "../protocol/catalog";

/** Own discovery and view composition; applications bind ports and pages provide layout. */
export function PluginUIProvider({
  source,
  transport,
  children,
}: {
  source: ExtensionUICatalogSource;
  transport: ExtensionViewTransport;
  children: ReactNode;
}) {
  const [catalog, setCatalog] = useState<ExtensionUICatalogState>({
    contributions: [],
    error: "",
  });
  useEffect(() => {
    setCatalog({ contributions: [], error: "" });
    const observer = observeUICatalog(source, setCatalog);
    const refresh = () => void observer.refresh();
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      observer.dispose();
    };
  }, [source]);
  const bound = useMemo(
    () => bindUIContributions(catalog.contributions),
    [catalog.contributions],
  );
  return (
    <ViewTransportContext.Provider value={transport}>
      <DialogRuntimeProvider contributions={catalog.contributions}>
        <ExtensionSlotProvider contributions={bound} error={catalog.error}>
          {children}
        </ExtensionSlotProvider>
      </DialogRuntimeProvider>
    </ViewTransportContext.Provider>
  );
}
