import type {
  ModelConfiguration,
  JsonValue,
  ModelPurpose,
} from "@mewvis/chat-contracts/model-configuration";
import type { ExecutionPolicy } from "../../../../../../security/execution/types.js";

export type MediaArtifact = {
  type: string;
  filePath?: string;
  mimeType?: string;
  size?: number;
  value?: JsonValue;
};
export type MediaResult = {
  status: "completed" | "failed" | "stopped";
  modelId: string;
  purpose: string;
  taskId?: string;
  stage?: string;
  outputs: MediaArtifact[];
  error?: string;
  resubmitAutomatically?: false;
};
export type MediaProgress = {
  stage: string;
  message: string;
  taskId?: string;
  outputs?: MediaArtifact[];
};
export type MediaArguments = {
  action: "list" | "generate";
  purpose?: string;
  input?: JsonValue;
  files?: JsonValue;
  parameters?: Record<string, JsonValue>;
  outputDirectory?: string;
  timeoutSeconds?: number;
};
export type MediaGenerationRequest = {
  model: { modelId: string; configuration: ModelConfiguration };
  purpose: ModelPurpose;
  arguments: MediaArguments;
  execution: ExecutionPolicy;
  protectedPaths: string[];
};
export type MediaRunContext = {
  signal?: AbortSignal;
  progress?(value: MediaProgress): void;
  fetch?: typeof globalThis.fetch;
};
export type MediaRunner = (
  request: MediaGenerationRequest,
  context: MediaRunContext,
) => Promise<MediaResult>;

/** Credential redaction is applied before values leave the generic tool. */
export function redactMedia<T>(value: T, secrets: readonly string[]): T {
  const keys = secrets.filter(Boolean);
  const visit = (item: unknown): unknown => {
    if (typeof item === "string")
      return keys.reduce(
        (text, key) => text.split(key).join("[redacted]"),
        item,
      );
    if (Array.isArray(item)) return item.map(visit);
    if (item && typeof item === "object")
      return Object.fromEntries(
        Object.entries(item).map(([key, entry]) => [key, visit(entry)]),
      );
    return item;
  };
  return visit(value) as T;
}
