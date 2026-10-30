import {
  getApplicationDataClient,
  type ApplicationDataClient,
} from "@mewvis/app-sdk/data";
import {
  getApplicationFileClient,
  type ApplicationFileClient,
} from "@mewvis/app-sdk/files";
import { createRecordStore } from "../../validation/records/file-store";
import type { BoardModel } from "./model";
import { parseBoardRecord, type BoardRecord } from "./records";
export const createBoardHistory = (
  data: ApplicationDataClient,
  files: ApplicationFileClient,
) =>
  createRecordStore<BoardModel, BoardRecord>(data, files, {
    modelFormat: "gameplay-board-economy-v1",
    parse: parseBoardRecord,
  });
let repository: ReturnType<typeof createBoardHistory> | undefined;
export const boardHistory = () =>
  (repository ??= createBoardHistory(
    getApplicationDataClient(),
    getApplicationFileClient(),
  ));
