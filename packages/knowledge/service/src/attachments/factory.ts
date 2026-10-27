import type { KnowledgeAttachmentStorageConfiguration } from "@mewvis/knowledge-sdk/configuration";
import { createLocalAttachmentStorage } from "./local.js";
import { fail } from "../util.js";

/** Object storage and custom adapters deliberately remain placeholders. */
export async function createAttachmentStorage(
  configuration: KnowledgeAttachmentStorageConfiguration,
) {
  if (configuration.kind === "local")
    return createLocalAttachmentStorage(
      configuration.directory,
      configuration.storageId,
    );
  return fail(
    "NOT_SUPPORTED",
    `${configuration.kind} attachment storage is reserved but not implemented`,
  );
}
