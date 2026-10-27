import type { KnowledgeServiceConfiguration } from "@mewvis/knowledge-sdk/configuration";
import type { KnowledgeService, KnowledgeServiceOptions } from "../../types.js";
import { fail } from "../../util.js";
/** Reserved backend; no client, connection or fallback storage is created. */
export async function createMongoKnowledgeService(
  _configuration: KnowledgeServiceConfiguration,
  _options: KnowledgeServiceOptions,
): Promise<KnowledgeService> {
  return fail(
    "NOT_SUPPORTED",
    "MongoDB adapter is reserved but not implemented",
  );
}
