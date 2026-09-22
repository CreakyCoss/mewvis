import type { ExtensionCapability } from "../agent/index.js";
import type { ExtensionSource, ExtensionBindings } from "./index.js";

export type ExtensionMappingMode =
  "direct" | "simulate" | "ignore" | "noop" | "error";
export type ExtensionCapabilityMapping =
  | { mode: "direct"; reason?: string }
  | { mode: "simulate" | "ignore" | "noop" | "error"; reason: string };
export interface ExtensionAdapterContext {
  taskId: string;
  runtimeId: string;
  signal?: AbortSignal;
}
export interface ExtensionAdapter<TNativePlugin> {
  readonly id: string;
  readonly protocolVersion: 1;
  readonly capabilities: Readonly<
    Partial<Record<ExtensionCapability, ExtensionCapabilityMapping>>
  >;
  /** Returns a native plugin/factory to register through the target Agent's own API. */
  adapt(
    bindings: ExtensionBindings,
    context: ExtensionAdapterContext,
  ): TNativePlugin;
}
export interface ExtensionAdaptationReport {
  adapterId: string;
  protocolVersion: 1;
  degraded: boolean;
  mappings: Array<{
    extensionId: string;
    capability: ExtensionCapability;
    mode: ExtensionMappingMode;
    reason?: string;
  }>;
}
export function defineExtensionAdapter<TNativePlugin>(
  adapter: ExtensionAdapter<TNativePlugin>,
): ExtensionAdapter<TNativePlugin>;
/** Negotiates declared requirements. Missing mappings default to error. No plugin code runs here. */
export function resolveExtensionAdaptation(
  adapter: ExtensionAdapter<unknown>,
  sources: readonly ExtensionSource[],
): ExtensionAdaptationReport;
