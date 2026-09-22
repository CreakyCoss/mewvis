import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  type UISessionContext,
  type UIContributionFor,
  type UISlotContext,
  type UISlotKey,
  type UISlotStatus,
  type UISlotDefinition,
} from "@isle/extension-sdk/ui";

import type { UIAdapters, UIAdapterProps, UIHostContribution } from "./adapter";
export { defineUIAdapter, createUIAdapters } from "./adapter";
export type { UIAdapters, UIAdapter, UIAdapterProps, UIHostContribution } from "./adapter";

const SurfaceContext = createContext<{ definition: UISlotDefinition; context: UISessionContext } | null>(null);
export function useUISlotContext<D extends UISlotDefinition>(definition: D): UISlotContext<D> {
  const surface = useContext(SurfaceContext);
  if (!surface || surface.definition.key !== definition.key)
    throw new Error(`UI context unavailable: ${definition.key}`);
  return surface.context;
}

type SlotRuntime = {
  adapters: UIAdapters;
  contributions: readonly UIHostContribution[];
  error?: string;
  surfaces: Partial<Record<UISlotKey, number>>;
  attach(name: UISlotKey): () => void;
};
const SlotContext = createContext<SlotRuntime | null>(null);

/** The host chooses adapters independently of protocol declarations and mounted surfaces. */
export function UISlotProvider({
  adapters,
  contributions,
  error,
  children,
}: {
  adapters: UIAdapters;
  contributions: readonly UIHostContribution[];
  error?: string;
  children: ReactNode;
}) {
  const [surfaces, setSurfaces] = useState<SlotRuntime["surfaces"]>({});
  const attach = useCallback((name: UISlotKey) => {
    setSurfaces((current) => ({ ...current, [name]: (current[name] ?? 0) + 1 }));
    return () => setSurfaces((current) => ({ ...current, [name]: (current[name] ?? 0) - 1 }));
  }, []);
  const runtime = useMemo(
    () => ({ adapters, contributions, error, surfaces, attach }),
    [adapters, contributions, error, surfaces, attach],
  );
  return <SlotContext.Provider value={runtime}>{children}</SlotContext.Provider>;
}

function useSlotRuntime() {
  const runtime = useContext(SlotContext);
  if (!runtime) throw new Error("UI 插槽需要 UISlotProvider");
  return runtime;
}

/** Query support separately from mounted surfaces. A no-op adapter is never reported as supported. */
export function useUISlotStatus(definition: UISlotDefinition): UISlotStatus {
  const { adapters, surfaces } = useSlotRuntime();
  const adapter = adapters[definition.type];
  return {
    key: definition.key,
    type: definition.type,
    support: adapter?.mode ?? "unsupported",
    reason: adapter?.mode === "noop" ? adapter.reason : undefined,
    surfaces: surfaces[definition.key] ?? 0,
  };
}

/** A page declares only its slot and context. Local contributions share the same adapter. */
export function UISlot<D extends UISlotDefinition>({
  definition,
  context,
  contributions = [],
}: {
  definition: D;
  context: UISlotContext<D>;
  contributions?: readonly UIHostContribution<UIContributionFor<NoInfer<D>>>[];
}) {
  const runtime = useSlotRuntime();
  useEffect(() => runtime.attach(definition.key), [runtime.attach, definition.key]);
  const adapter = runtime.adapters[definition.type];
  if (!adapter || adapter.mode === "noop") return null;
  const items = [...contributions, ...runtime.contributions].filter(
    (item) => item.contribution.slot === definition.key && item.contribution.type === definition.type,
  );
  // Both the adapter and its input are selected by the same protocol discriminator above.
  const Renderer = adapter.component as ComponentType<UIAdapterProps>;
  return (
    <SurfaceContext.Provider value={{ definition, context }}>
      <Renderer definition={definition} context={context} contributions={items} error={runtime.error} />
    </SurfaceContext.Provider>
  );
}
