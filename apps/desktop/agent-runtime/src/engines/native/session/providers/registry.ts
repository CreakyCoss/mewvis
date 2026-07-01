import { jsonlRuntimeSessionProvider } from "./jsonl/index.js";
import type {
  RuntimeSessionProvider,
  RuntimeSessionProviderId,
} from "./types.js";

const runtimeSessionProviders = Object.freeze([
  jsonlRuntimeSessionProvider,
] satisfies readonly RuntimeSessionProvider[]);

const createRuntimeSessionProviderRegistry = (
  providers: readonly RuntimeSessionProvider[],
): Readonly<Record<string, RuntimeSessionProvider>> =>
  Object.freeze(Object.fromEntries(
    providers.map((provider) => [provider.id, provider]),
  ));

const runtimeSessionProviderRegistry = createRuntimeSessionProviderRegistry(
  runtimeSessionProviders,
);

export const runtimeSessionProviderManifest = Object.freeze({
  defaultProviderId: jsonlRuntimeSessionProvider.id,
  providers: Object.freeze(runtimeSessionProviders.map((provider) => provider.id)),
});

export const getRuntimeSessionProvider = (
  id: RuntimeSessionProviderId,
) => runtimeSessionProviderRegistry[id] ?? null;

export const listRuntimeSessionProviders = () => [...runtimeSessionProviders];
