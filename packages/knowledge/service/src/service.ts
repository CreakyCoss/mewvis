import {
  parseKnowledgeServiceConfiguration,
  type KnowledgeServiceConfiguration,
} from "@mewvis/knowledge-sdk/configuration";
import type { KnowledgeService, KnowledgeServiceOptions } from "./types.js";

/** The public contract is backend-neutral; each backend owns its storage, indexing and queue implementation. */
export async function createKnowledgeService(
  configuration: KnowledgeServiceConfiguration,
  options: KnowledgeServiceOptions = {},
): Promise<KnowledgeService> {
  const config = parseKnowledgeServiceConfiguration(configuration);
  if (config.backend.kind === "mongodb")
    return (
      await import("./providers/mongodb/index.js")
    ).createMongoKnowledgeService(config, options);
  if (config.backend.kind === "remote")
    return (
      await import("./providers/remote/index.js")
    ).createRemoteKnowledgeService(config, options);
  const { createSqliteKnowledgeService } =
    await import("./providers/sqlite/index.js");
  return createSqliteKnowledgeService(
    { ...config, backend: config.backend },
    options,
  );
}
