import type { ComponentType, ReactNode } from "react";
import {
  uiSlotTypes,
  type UIContribution,
  type UISessionContext,
  type UISlotDefinition,
  type UISlotType,
  type UIViewReference,
} from "@isle/extension-sdk/ui";

/** A source binds serializable protocol data to its own view loader. */
export interface UIHostContribution<C extends UIContribution = UIContribution> {
  key: string;
  contribution: C;
  renderView(view: UIViewReference, context: UISessionContext): ReactNode;
}
export interface UIAdapterProps<T extends UISlotType = UISlotType> {
  definition: Extract<UISlotDefinition, { type: T }>;
  context: UISessionContext;
  contributions: readonly UIHostContribution<Extract<UIContribution, { type: T }>>[];
  error?: string;
}
export type UIAdapter<T extends UISlotType> = { type: T } & (
  { mode: "supported"; component: ComponentType<UIAdapterProps<T>> } | { mode: "noop"; reason: string }
);
export type UIAdapters = { readonly [T in UISlotType]?: UIAdapter<T> };
export type UIAdapterRegistration = { [T in UISlotType]: UIAdapter<T> }[UISlotType];

export function defineUIAdapter<T extends UISlotType>(
  kind: { readonly type: T },
  implementation:
    | Omit<Extract<UIAdapter<NoInfer<T>>, { mode: "supported" }>, "type">
    | Omit<Extract<UIAdapter<NoInfer<T>>, { mode: "noop" }>, "type">,
): UIAdapter<T> {
  return { ...implementation, type: kind.type };
}

/** Discovery is host-specific; validation and lookup are independent of the bundler. */
export function createUIAdapters(registrations: readonly UIAdapterRegistration[]): UIAdapters {
  const adapters: Record<string, UIAdapterRegistration> = Object.create(null);
  const known = new Set(Object.values(uiSlotTypes).map((kind) => kind.type));
  for (const adapter of registrations) {
    if (!known.has(adapter.type)) throw new Error(`Unknown UI adapter type: ${adapter.type}`);
    if (adapters[adapter.type]) throw new Error(`Duplicate UI adapter: ${adapter.type}`);
    if (adapter.mode === "noop" && !adapter.reason.trim())
      throw new Error(`No-op UI adapter needs a reason: ${adapter.type}`);
    adapters[adapter.type] = adapter;
  }
  return Object.freeze(adapters) as UIAdapters;
}
