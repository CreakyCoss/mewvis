import type {
  JsonValue,
  ModelProtocol,
  ModelPurpose,
  RuntimeModelCapabilities,
  RuntimeModelLimits,
  RuntimeModelModality,
  RuntimeModelOperation,
} from "@mewvis/chat-contracts";
import type { RuntimeApiFormat } from "@/agent-client/wire";

interface PresetOption<Value extends string> {
  value: Value;
  label: string;
}

export interface CommonPreset {
  defaultProvider: string;
  protocols: (PresetOption<ModelProtocol> & { apiEndpoint?: string })[];
  modalities: PresetOption<RuntimeModelModality>[];
  operations: PresetOption<RuntimeModelOperation>[];
  thinkingLevels: PresetOption<string>[];
  modelDefaults: {
    capabilities: RuntimeModelCapabilities;
    limits: Required<RuntimeModelLimits>;
  };
  sampleInput: JsonValue;
  templates: readonly ModelPreset[];
}

/** One supplier owns its connection suggestions, documented model defaults and purpose templates. */
export interface ProviderPreset {
  id: string;
  label: string;
  websiteUrl: string;
  apis: { apiFormat: RuntimeApiFormat; apiEndpoint: string }[];
  idPrefixes?: readonly string[];
  thinking?: Partial<Record<RuntimeApiFormat, readonly string[]>>;
  models?: readonly ModelMetadataPreset[];
  templates?: readonly ModelPreset[];
}

/** Exact model IDs only: unknown models keep the common defaults. */
export interface ModelMetadataPreset {
  modelIds: readonly string[];
  sourceUrl: string;
  limits?: RuntimeModelLimits;
  capabilities?: Partial<RuntimeModelCapabilities>;
  thinking?: Partial<Record<RuntimeApiFormat, readonly string[]>>;
}

/** Editor templates only. Saved model configuration and execution do not depend on this catalog. */
export interface ModelPreset {
  id: string;
  version: number;
  label: string;
  purpose: ModelPurpose;
  sampleInput?: JsonValue;
  sourceUrl?: string;
  isDefault?: boolean;
  match?: {
    modelIds?: readonly string[];
    modelPrefixes?: readonly string[];
    modelPattern?: string;
  };
}
