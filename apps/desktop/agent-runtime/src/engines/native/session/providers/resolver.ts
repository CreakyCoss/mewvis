import {
  getRuntimeSessionProvider,
  runtimeSessionProviderManifest,
} from "./registry.js";
import type {
  RuntimeSessionProvider,
  RuntimeSessionProviderId,
} from "./types.js";

export const resolveRuntimeSessionProvider = (
  providerId: RuntimeSessionProviderId | null | undefined =
    runtimeSessionProviderManifest.defaultProviderId,
): RuntimeSessionProvider => {
  const id = providerId || runtimeSessionProviderManifest.defaultProviderId;
  const provider = getRuntimeSessionProvider(id);
  if (!provider) {
    throw new Error(`未知 runtime session provider：${id}`);
  }
  return provider;
};
