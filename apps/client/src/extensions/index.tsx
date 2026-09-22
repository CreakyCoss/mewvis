import { useMemo, type ReactNode } from "react";
import { UISlotProvider } from "./slots";
import { uiAdapters } from "./slots/adapters";
import { useExtensionCatalog } from "./catalog";
import { bindUIContributions } from "./contributions";

/** Desktop extension host. Adapter modules declare their own support. */
export function ExtensionHost({ children }: { children: ReactNode }) {
  const catalog = useExtensionCatalog();
  const contributions = useMemo(() => bindUIContributions(catalog.contributions), [catalog.contributions]);
  return (
    <UISlotProvider adapters={uiAdapters} contributions={contributions} error={catalog.error}>
      {children}
    </UISlotProvider>
  );
}
