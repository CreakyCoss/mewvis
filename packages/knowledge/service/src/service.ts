import {
  parseKnowledgeServiceConfiguration,
  type KnowledgeServiceConfiguration,
} from "@mewvis/knowledge-sdk/configuration";
import type { KnowledgeService, KnowledgeServiceOptions } from "./types.js";
import { fail } from "./util.js";

/** The public contract is backend-neutral; each backend owns its storage, indexing and queue implementation. */
export async function createKnowledgeService(
  configuration: KnowledgeServiceConfiguration,
  options: KnowledgeServiceOptions = {},
): Promise<KnowledgeService> {
  const config = parseKnowledgeServiceConfiguration(configuration);
  if (config.backend.kind !== "sqlite")
    fail(
      "NOT_SUPPORTED",
      "This service currently implements the SQLite backend only",
    );
  const { createSqliteKnowledgeService } =
    await import("./providers/sqlite/index.js");
  return createSqliteKnowledgeService(
    { ...config, backend: config.backend },
    options,
  );
}
