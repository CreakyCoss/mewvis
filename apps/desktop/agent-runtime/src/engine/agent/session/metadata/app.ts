import type {
  RuntimeMessageActorType,
  RuntimeMessageRole,
  RuntimeMessageScope,
  RuntimeMessageSource,
} from "../../../../session/core/types.js";
import { standardizeRuntimeMessageMetadata } from "../../../../session/metadata/standard.js";

export const commandRuntimeMessageMetadata = (input: {
  role: RuntimeMessageRole;
  source: Extract<RuntimeMessageSource, "app_create_session" | "app_append" | "app_rebuild" | "app_edit">;
  baseLeafId: string | null;
  metadata?: Record<string, unknown> | null;
}) =>
  standardizeRuntimeMessageMetadata({
    role: input.role,
    source: input.source,
    baseLeafId: input.baseLeafId,
    metadata: input.metadata,
  });

export const runtimeLedgerOperationMetadata = (input: {
  source: RuntimeMessageSource;
  baseLeafId: string | null;
  [key: string]: unknown;
}) => ({
  ...input,
  runtimeMetadataVersion: 1,
  actorType: "runtime" satisfies RuntimeMessageActorType,
  scope: "shared" satisfies RuntimeMessageScope,
});
