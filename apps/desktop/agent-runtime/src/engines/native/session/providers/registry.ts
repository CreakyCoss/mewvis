import { jsonlRuntimeSessionProvider } from "./jsonl/index.js";
import type {
  RuntimeSessionProvider,
  RuntimeSessionProviderId,
} from "./types.js";

const providers = new Map<RuntimeSessionProviderId, RuntimeSessionProvider>();

export const registerRuntimeSessionProvider = (
  provider: RuntimeSessionProvider,
) => {
  providers.set(provider.id, provider);
};

export const getRuntimeSessionProvider = (
  id: RuntimeSessionProviderId,
) => providers.get(id) ?? null;

export const listRuntimeSessionProviders = () => [...providers.values()];

registerRuntimeSessionProvider(jsonlRuntimeSessionProvider);
