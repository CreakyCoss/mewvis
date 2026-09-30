import { invoke } from "@/transport";
import { invokeNode } from "@/transport/http";
import {
  buildRuntimeModelInputs,
  buildRuntimeModelOptions,
  type LlmSettings,
  type LlmSettingsConfig,
} from "@/agent-client/runtime-model";

type LoadOptions = { refresh?: boolean };

export type DiscoveredProviderModel = { modelId: string; modelName: string };

export const discoverProviderModels = (
  input: { apiFormat: string; apiEndpoint: string; apiKey: string },
  signal?: AbortSignal,
) => invokeNode<{ models: DiscoveredProviderModel[] }>("discover_provider_models", { input }, signal);
// Host-only configuration, shared by catalog, runs and ledger summaries.
// Callers receive copies; credentials never enter Chat snapshots or component props.
let cachedSettings: LlmSettings | undefined;
let pendingRead: Promise<LlmSettings> | undefined;
let pendingSave: Promise<LlmSettings> | undefined;
let saveQueue = Promise.resolve();
let revision = 0;

const loadSettings = ({ refresh = false }: LoadOptions = {}): Promise<LlmSettings> => {
  if (pendingSave)
    return pendingSave.then(
      () => loadSettings(),
      () => loadSettings({ refresh }),
    );
  if (pendingRead) return pendingRead;
  if (!refresh && cachedSettings) return Promise.resolve(cachedSettings);

  const readingRevision = revision;
  cachedSettings = undefined;
  const request = Promise.resolve()
    .then(() => invoke<LlmSettings>("get_llm_settings"))
    .then(
      (settings) => {
        if (revision !== readingRevision) return loadSettings();
        cachedSettings = structuredClone(settings);
        return cachedSettings;
      },
      (error) => {
        if (revision !== readingRevision) return loadSettings();
        throw error;
      },
    )
    .finally(() => {
      if (pendingRead === request) pendingRead = undefined;
    });
  pendingRead = request;
  return request;
};

export const getLlmSettings = (options?: LoadOptions) =>
  loadSettings(options).then((settings) => structuredClone(settings));

export const saveLlmSettings = (input: LlmSettingsConfig) => {
  const submitted = structuredClone(input);
  // Supersede older reads immediately, including reads that fail after this save.
  revision++;
  pendingRead = undefined;
  const request = saveQueue
    .then(() => invoke<LlmSettings>("save_llm_settings", { input: submitted }))
    .then((settings) => {
      cachedSettings = structuredClone(settings);
      return cachedSettings;
    })
    .finally(() => {
      if (pendingSave === request) pendingSave = undefined;
    });
  pendingSave = request;
  saveQueue = request.then(
    () => undefined,
    () => undefined,
  );
  return request.then((settings) => structuredClone(settings));
};

export const getLlmModelOptions = async (options?: LoadOptions) =>
  buildRuntimeModelOptions(await getLlmSettings(options));

export const resolveLlmModel = async (modelId: string, thinkingLevel?: string | null) => {
  const model = buildRuntimeModelInputs(await getLlmSettings())[modelId];
  if (!model) throw new Error("所选模型已不可用，请重新选择");
  if (thinkingLevel !== undefined) model.thinkingLevel = thinkingLevel;
  return model;
};
