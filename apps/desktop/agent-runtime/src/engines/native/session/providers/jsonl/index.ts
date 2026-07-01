import type { RuntimeSessionProvider } from "../types.js";
import type {
  RuntimeSessionContext,
} from "../../model/ledger.js";
import {
  clearRuntimeSessionArtifactDir,
  resolveRuntimeSessionArtifactDir,
} from "../../internal/artifacts.js";
import { refreshRuntimeSessionManifest } from "./manifest.js";
import { resolveRuntimeSessionPaths } from "./paths.js";
import {
  appendRuntimeSessionTraceRecord,
  ensureRuntimeSessionTraceFile,
} from "./trace.js";
import { RuntimeLedgerStorage } from "./store.js";
import {
  getCollaborationTimeline,
  getRuntimeSessionSnapshot,
  listRuntimeSessions,
} from "./query.js";
import {
  appendRuntimeSessionMessages,
  compactRuntimeSessionContent,
  deleteRuntimeSession,
  deleteRuntimeSessionMessage,
  editRuntimeSessionMessage,
  readRuntimeSession,
  readRuntimeSessionAgentVisibleContext,
  recordRuntimeSessionEvent,
  rebuildRuntimeSession,
  summarizeRuntimeSession,
} from "../../internal/service.js";
import {
  prepareRuntimeSessionTurn,
} from "../../internal/writer.js";
import type {
  RuntimeSessionStorageProvider,
} from "../../internal/storage.js";
import { JsonlRuntimeSessionRecorder } from "./recorder.js";

const contextViewFrom = ({
  leafId: _leafId,
  entries: _entries,
  ...context
}: RuntimeSessionContext) => context;

const jsonlRuntimeSessionStorageProvider: RuntimeSessionStorageProvider = {
  async resolvePaths(input) {
    return resolveRuntimeSessionPaths(input);
  },

  async openOrCreate(input) {
    const paths = await resolveRuntimeSessionPaths(input);
    await ensureRuntimeSessionTraceFile(paths.tracePath);
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
};

export const jsonlRuntimeSessionProvider: RuntimeSessionProvider = {
  id: "jsonl",

  async initSession(input) {
    const handle = await jsonlRuntimeSessionStorageProvider.openOrCreate(input);
    await handle.refreshManifest();
  },

  async refreshSession(input) {
    const handle = await jsonlRuntimeSessionStorageProvider.openOrCreate(input);
    await handle.refreshManifest();
  },

  createRecorder(input) {
    return JsonlRuntimeSessionRecorder.create(
      input,
      jsonlRuntimeSessionStorageProvider,
    );
  },

  async prepareTurn(input, options) {
    const prepared = await prepareRuntimeSessionTurn(
      input,
      jsonlRuntimeSessionStorageProvider,
      options,
    );
    if (!prepared) {
      return null;
    }
    return {
      command: prepared.command,
      contextAnchorId: prepared.contextLeafId,
      runtimeParentRecordId: prepared.runtimeParentEntryId,
      sessionContext: contextViewFrom(prepared.sessionContext),
      systemPrompt: prepared.systemPrompt,
      updatedSessionContext: contextViewFrom(prepared.updatedSessionContext),
    };
  },

  readSession(input) {
    return readRuntimeSession(input, jsonlRuntimeSessionStorageProvider);
  },

  summarizeSession(input, options) {
    return summarizeRuntimeSession(input, jsonlRuntimeSessionStorageProvider, options);
  },

  appendSessionMessages(input) {
    return appendRuntimeSessionMessages(input, jsonlRuntimeSessionStorageProvider);
  },

  rebuildSession(input) {
    return rebuildRuntimeSession(input, jsonlRuntimeSessionStorageProvider);
  },

  editSessionMessage(input) {
    return editRuntimeSessionMessage(input, jsonlRuntimeSessionStorageProvider);
  },

  deleteSessionMessage(input) {
    return deleteRuntimeSessionMessage(input, jsonlRuntimeSessionStorageProvider);
  },

  compactSession(input) {
    return compactRuntimeSessionContent(input, jsonlRuntimeSessionStorageProvider);
  },

  deleteSession(input) {
    return deleteRuntimeSession(input, jsonlRuntimeSessionStorageProvider);
  },

  readAgentVisibleContext(input) {
    return readRuntimeSessionAgentVisibleContext(input, jsonlRuntimeSessionStorageProvider);
  },

  recordSessionEvent(input) {
    return recordRuntimeSessionEvent(input, jsonlRuntimeSessionStorageProvider);
  },

  async appendTraceRecord(input) {
    const handle = await jsonlRuntimeSessionStorageProvider.openOrCreate(input);
    return handle.appendTrace(input.record);
  },

  resolveArtifactDir(input) {
    return resolveRuntimeSessionArtifactDir(
      jsonlRuntimeSessionStorageProvider,
      input,
      input.segments,
    );
  },

  clearArtifactDir(input) {
    return clearRuntimeSessionArtifactDir(
      jsonlRuntimeSessionStorageProvider,
      input,
      input.segments,
    );
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
