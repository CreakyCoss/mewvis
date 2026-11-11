import {
  getApplicationDataClient,
  type ApplicationDataClient,
} from "@mewvis/app-sdk/data";
import {
  getApplicationFileClient,
  type ApplicationFileClient,
} from "@mewvis/app-sdk/files";
import type { Project } from "../../../app/projects/model";
import { createRecordStore } from "../../../validation/records/file-store";
import type { BoardModel } from "../model";
import { boardExperimentAfterLoad, type BoardExperiment } from "./model";
import { createBoardExperimentParser } from "./records";
export function createBoardExperimentHistory(
  data: ApplicationDataClient,
  files: ApplicationFileClient,
) {
  const store = createRecordStore<BoardModel, BoardExperiment>(data, files, {
    modelFormat: "gameplay-board-economy-v1",
    directory: "experiments",
    maxBytes: 16 * 1024 * 1024,
    parse: createBoardExperimentParser(),
  });
  return {
    ...store,
    list: async (project: Project<BoardModel>) => {
      const result = await store.list(project);
      return {
        ...result,
        records: result.records.map(boardExperimentAfterLoad),
      };
    },
  };
}
let repository: ReturnType<typeof createBoardExperimentHistory> | undefined;
export const boardExperimentHistory = () =>
  (repository ??= createBoardExperimentHistory(
    getApplicationDataClient(),
    getApplicationFileClient(),
  ));
