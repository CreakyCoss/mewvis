import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  UIContribution,
  UIContributionFor,
  UISessionContext,
  UISlotContext,
  UISlotDefinition,
  UISlotKey,
  UISlotStatus,
  UIViewReference,
} from "@isle/extension-sdk/ui";

type ViewRenderer = (view: UIViewReference, context: UISessionContext) => ReactNode;
/** Source binding. Data-only contributions need no executable view loader. */
export type UIHostContribution<C extends UIContribution = UIContribution> = C extends UIContribution
  ? { key: string; contribution: C } & (C extends { view: UIViewReference }
      ? { renderView: ViewRenderer }
      : { renderView?: never })
  : never;
/** Protocol fields stay intact; only view-bearing contributions receive a scoped renderer. */
export type SlotItem<C extends UIContribution> = C extends UIContribution
  ? Readonly<C> & { readonly key: string } & (C extends { view: UIViewReference } ? { renderView(): ReactNode } : {})
  : never;
export interface SlotCollection<T> {
  items: readonly T[];
  error?: string;
}
export type SlotRenderer<T> =
  | { render(item: T): ReactNode; renderAll?: never; fallback?: ReactNode; renderError?(error: string): ReactNode }
  | { render?: never; renderAll(collection: SlotCollection<T>): ReactNode; fallback?: never; renderError?: never };
export type ExtensionSlotProps<D extends UISlotDefinition> = {
  definition: D;
  context: UISlotContext<NoInfer<D>>;
} & SlotRenderer<SlotItem<UIContributionFor<NoInfer<D>>>>;

const SurfaceContext = createContext<{ definition: UISlotDefinition; context: UISessionContext } | null>(null);
export function useExtensionSlotContext<D extends UISlotDefinition>(definition: D): UISlotContext<D> {
  const surface = useContext(SurfaceContext);
  if (!surface || surface.definition.key !== definition.key)
    throw new Error(`Slot context unavailable: ${definition.key}`);
  return surface.context;
}
type SlotRuntime = {
  contributions: readonly UIHostContribution[];
  error?: string;
  surfaces: Partial<Record<UISlotKey, number>>;
  attach(key: UISlotKey): () => void;
};
const RuntimeContext = createContext<SlotRuntime | null>(null);

/** Supplies contributions, not layout components. Pages choose whether and how to render. */
export function ExtensionSlotProvider({
  contributions,
  error,
  children,
}: {
  contributions: readonly UIHostContribution[];
  error?: string;
  children: ReactNode;
}) {
  const [surfaces, setSurfaces] = useState<SlotRuntime["surfaces"]>({});
  const attach = useCallback((key: UISlotKey) => {
    setSurfaces((current) => ({ ...current, [key]: (current[key] ?? 0) + 1 }));
    return () => setSurfaces((current) => ({ ...current, [key]: (current[key] ?? 0) - 1 }));
  }, []);
  const runtime = useMemo(() => ({ contributions, error, surfaces, attach }), [contributions, error, surfaces, attach]);
  return <RuntimeContext.Provider value={runtime}>{children}</RuntimeContext.Provider>;
}
function useSlotRuntime() {
  const runtime = useContext(RuntimeContext);
  if (!runtime) throw new Error("ExtensionSlotProvider is required");
  return runtime;
}
/** Counts mounted surfaces; registration alone never implies a renderer or an opened view. */
export function useExtensionSlotStatus(definition: UISlotDefinition): UISlotStatus {
  const { surfaces } = useSlotRuntime();
  return { key: definition.key, type: definition.type, surfaces: surfaces[definition.key] ?? 0 };
}
function bindItem(entry: UIHostContribution, context: UISessionContext): SlotItem<UIContribution> {
  const contribution = entry.contribution;
  if ("view" in contribution) {
    const render = entry.renderView;
    if (!render) throw new Error(`Missing view binding: ${entry.key}`);
    const viewKey = JSON.stringify([entry.key, contribution.view.id, context.workspacePath, context.chatId]);
    return {
      ...contribution,
      key: entry.key,
      renderView: () => <Fragment key={viewKey}>{render(contribution.view, context)}</Fragment>,
    };
  }
  return { ...contribution, key: entry.key };
}

/** Headless, typed escape hatch for any protocol slot; never chooses page layout. */
export function ExtensionSlot<D extends UISlotDefinition>(props: ExtensionSlotProps<D>) {
  const { definition, context } = props;
  const runtime = useSlotRuntime();
  useEffect(() => runtime.attach(definition.key), [runtime.attach, definition.key]);
  const entries = runtime.contributions.filter(
    (entry) => entry.contribution.slot === definition.key && entry.contribution.type === definition.type,
  );
  // The definition filters both the key and type before correlating the generic render input.
  const items = entries.map((entry) => bindItem(entry, context)) as SlotItem<UIContributionFor<D>>[];
  return (
    <SurfaceContext.Provider value={{ definition, context }}>
      {props.renderAll ? (
        props.renderAll({ items, error: runtime.error })
      ) : (
        <>
          {runtime.error ? props.renderError?.(runtime.error) : null}
          {items.length
            ? items.map((item) => <Fragment key={item.key}>{props.render(item)}</Fragment>)
            : props.fallback}
        </>
      )}
    </SurfaceContext.Provider>
  );
}
