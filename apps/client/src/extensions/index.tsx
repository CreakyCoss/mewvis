import { useMemo, type ReactNode } from "react";
import { ExtensionSlotProvider } from "./slots";
import { useExtensionCatalog } from "./catalog";
import { bindUIContributions } from "./contributions";

/** Desktop extension host. Pages supply their own slot renderers. */
export function ExtensionHost({ children }: { children: ReactNode }) {
  const catalog = useExtensionCatalog();
  const contributions = useMemo(() => bindUIContributions(catalog.contributions), [catalog.contributions]);
  return (
    <ExtensionSlotProvider contributions={contributions} error={catalog.error}>
      {children}
    </ExtensionSlotProvider>
  );
}
