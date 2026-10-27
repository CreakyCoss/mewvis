import type { KnowledgeServiceConfiguration } from "@mewvis/knowledge-sdk/configuration";
import type { KnowledgeService, KnowledgeServiceOptions } from "../../types.js";
import { fail } from "../../util.js";
/** Protocol-specific adapters remain explicit extension points. */
export const remoteProviderPlaceholders = [
  "mewvis",
  "dify",
  "ragflow",
] as const;
export async function createRemoteKnowledgeService(
  _configuration: KnowledgeServiceConfiguration,
  _options: KnowledgeServiceOptions,
): Promise<KnowledgeService> {
  return fail(
    "NOT_SUPPORTED",
    "Remote and third-party knowledge adapters are reserved but not implemented",
  );
}
