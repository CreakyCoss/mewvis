import {
  getRuntimeSessionProvider,
} from "./registry.js";
import type {
  RuntimeSessionProvider,
  RuntimeSessionProviderId,
} from "./types.js";

const DEFAULT_RUNTIME_SESSION_PROVIDER: RuntimeSessionProviderId = "jsonl";

export const resolveRuntimeSessionProvider = (
  providerId: RuntimeSessionProviderId | null | undefined = DEFAULT_RUNTIME_SESSION_PROVIDER,
): RuntimeSessionProvider => {
  const id = providerId || DEFAULT_RUNTIME_SESSION_PROVIDER;
  const provider = getRuntimeSessionProvider(id);
  if (!provider) {
    throw new Error(`未知 runtime session provider：${id}`);
  }
  return provider;
};
