import {
  getApplicationDataClient,
  type ApplicationDataClient,
} from "@mewvis/app-sdk/data";
import {
  getApplicationFileClient,
  type ApplicationFileClient,
} from "@mewvis/app-sdk/files";
import { createRecordStore } from "../../validation/records/file-store";
import type { DoudizhuModel } from "./model";
import { parseDoudizhuRecord, type DoudizhuRecord } from "./records";
export function createDoudizhuHistory(
  data: ApplicationDataClient,
  files: ApplicationFileClient,
) {
  return createRecordStore<DoudizhuModel, DoudizhuRecord>(data, files, {
    modelFormat: "gameplay-doudizhu-v1",
    parse: parseDoudizhuRecord,
  });
}
let repository: ReturnType<typeof createDoudizhuHistory> | undefined;
export const doudizhuHistory = () =>
  (repository ??= createDoudizhuHistory(
    getApplicationDataClient(),
    getApplicationFileClient(),
  ));
