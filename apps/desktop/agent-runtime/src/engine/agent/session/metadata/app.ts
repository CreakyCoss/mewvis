import type {
  BridgeMessageActorType,
  BridgeMessageRole,
  BridgeMessageScope,
  BridgeMessageSource,
} from "../../../../session/core/types.js";
import { standardizeBridgeMessageMetadata } from "../../../../session/metadata/standard.js";

export const commandBridgeMessageMetadata = (input: {
  role: BridgeMessageRole;
  source: Extract<BridgeMessageSource, "app_create_session" | "app_append" | "app_rebuild" | "app_edit">;
  baseLeafId: string | null;
  metadata?: Record<string, unknown> | null;
}) =>
  standardizeBridgeMessageMetadata({
    role: input.role,
    source: input.source,
    baseLeafId: input.baseLeafId,
    metadata: input.metadata,
  });

export const bridgeLedgerOperationMetadata = (input: {
  source: BridgeMessageSource;
  baseLeafId: string | null;
  [key: string]: unknown;
}) => ({
  ...input,
  bridgeMetadataVersion: 1,
  actorType: "bridge" satisfies BridgeMessageActorType,
  scope: "shared" satisfies BridgeMessageScope,
});
