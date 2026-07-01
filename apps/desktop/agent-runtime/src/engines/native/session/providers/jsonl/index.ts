import type { RuntimeSessionProvider } from "../types.js";
import { refreshRuntimeSessionManifest } from "./manifest.js";
import { resolveRuntimeSessionPaths } from "./paths.js";
import {
  appendRuntimeSessionTraceRecord,
} from "./trace.js";
import { RuntimeLedgerStorage } from "./store.js";
import {
  getCollaborationTimeline,
  getRuntimeSessionSnapshot,
  listRuntimeSessions,
} from "./query.js";

export const jsonlRuntimeSessionProvider: RuntimeSessionProvider = {
  id: "jsonl",

  async resolvePaths(input) {
    return resolveRuntimeSessionPaths(input);
  },

  async openOrCreate(input) {
    const paths = await resolveRuntimeSessionPaths(input);
    const storage = await RuntimeLedgerStorage.openOrCreate({
      filePath: paths.ledgerPath,
      workspacePath: input.workspacePath,
      sessionRootDir: input.sessionRootDir,
    });
    return {
      paths,
      storage,
      appendTrace(record) {
        return appendRuntimeSessionTraceRecord(paths.tracePath, record);
      },
      async refreshManifest() {
        await refreshRuntimeSessionManifest({
          workspacePath: input.workspacePath,
          sessionRootDir: input.sessionRootDir,
          ledgerPath: paths.ledgerPath,
          tracePath: paths.tracePath,
          ledger: storage,
        });
      },
    };
  },

  listRuntimeSessions(input) {
    return listRuntimeSessions(input);
  },

  getRuntimeSessionSnapshot(target, options) {
    return getRuntimeSessionSnapshot(target, options);
  },

  getCollaborationTimeline(target, options) {
    return getCollaborationTimeline(target, options);
  },
};
