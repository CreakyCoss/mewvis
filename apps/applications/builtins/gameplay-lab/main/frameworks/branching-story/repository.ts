import {
  getApplicationDataClient,
  type ApplicationDataClient,
} from "@mewvis/app-sdk/data";
import {
  getApplicationFileClient,
  type ApplicationFileClient,
} from "@mewvis/app-sdk/files";
import { createRecordStore } from "../../validation/records/file-store";
import type { NarrativeModel } from "./model";
import { parseStoryRecord, type StoryRecord } from "./records";
export function createNarrativeHistory(
  data: ApplicationDataClient,
  files: Pick<
    ApplicationFileClient,
    "mkdir" | "list" | "stat" | "readText" | "writeText" | "remove"
  >,
) {
  return createRecordStore<NarrativeModel, StoryRecord>(data, files, {
    modelFormat: "gameplay-narrative-v1",
    parse: parseStoryRecord,
  });
}
let repository: ReturnType<typeof createNarrativeHistory> | undefined;
export const narrativeHistory = () =>
  (repository ??= createNarrativeHistory(
    getApplicationDataClient(),
    getApplicationFileClient(),
  ));
