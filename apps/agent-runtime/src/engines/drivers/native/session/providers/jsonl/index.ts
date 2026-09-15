import type { RuntimeSessionProvider } from "../types.js";
import type { RuntimeSessionContext } from "../../model/ledger.js";
import { clearRuntimeSessionArtifactDir, resolveRuntimeSessionArtifactDir } from "../../internal/artifacts.js";
import { refreshRuntimeSessionManifest } from "./manifest.js";
import { resolveRuntimeSessionPaths } from "./paths.js";
import { appendRuntimeSessionTraceRecord, ensureRuntimeSessionTraceFile } from "./trace.js";
import { RuntimeLedgerStorage } from "./store.js";
import {
  getCollaborationTimeline,
  getRuntimeSessionDebugSnapshot,
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
import { prepareRuntimeSessionTurn } from "../../internal/writer.js";
import type { RuntimeSessionStorageProvider } from "../../internal/storage.js";
import { JsonlRuntimeSessionRecorder } from "./recorder.js";

const contextViewFrom = ({ leafId: _leafId, entries: _entries, ...context }: RuntimeSessionContext) => context;

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

class JsonlRuntimeSessionProvider implements RuntimeSessionProvider {
  readonly id = "jsonl" as const;

  initSession: RuntimeSessionProvider["initSession"] = async (input) => {
    const handle = await jsonlRuntimeSessionStorageProvider.openOrCreate(input);
    await handle.refreshManifest();
  };

  refreshSession: RuntimeSessionProvider["refreshSession"] = async (input) => {
    const handle = await jsonlRuntimeSessionStorageProvider.openOrCreate(input);
    await handle.refreshManifest();
  };

  createRecorder: RuntimeSessionProvider["createRecorder"] = (input) => {
    return JsonlRuntimeSessionRecorder.create(input, jsonlRuntimeSessionStorageProvider);
  };

  prepareTurn: RuntimeSessionProvider["prepareTurn"] = async (input, options) => {
    const prepared = await prepareRuntimeSessionTurn(input, jsonlRuntimeSessionStorageProvider, options);
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
  };

  readSession: RuntimeSessionProvider["readSession"] = (input) => {
    return readRuntimeSession(input, jsonlRuntimeSessionStorageProvider);
  };

  summarizeSession: RuntimeSessionProvider["summarizeSession"] = (input) => {
    return summarizeRuntimeSession(input, jsonlRuntimeSessionStorageProvider);
  };

  appendSessionMessages: RuntimeSessionProvider["appendSessionMessages"] = (input) => {
    return appendRuntimeSessionMessages(input, jsonlRuntimeSessionStorageProvider);
  };

  rebuildSession: RuntimeSessionProvider["rebuildSession"] = (input) => {
    return rebuildRuntimeSession(input, jsonlRuntimeSessionStorageProvider);
  };

  editSessionMessage: RuntimeSessionProvider["editSessionMessage"] = (input) => {
    return editRuntimeSessionMessage(input, jsonlRuntimeSessionStorageProvider);
  };

  deleteSessionMessage: RuntimeSessionProvider["deleteSessionMessage"] = (input) => {
    return deleteRuntimeSessionMessage(input, jsonlRuntimeSessionStorageProvider);
  };

  compactSession: RuntimeSessionProvider["compactSession"] = (input) => {
    return compactRuntimeSessionContent(input, jsonlRuntimeSessionStorageProvider);
  };

  deleteSession: RuntimeSessionProvider["deleteSession"] = (input) => {
    return deleteRuntimeSession(input, jsonlRuntimeSessionStorageProvider);
  };

  readAgentVisibleContext: RuntimeSessionProvider["readAgentVisibleContext"] = (input) => {
    return readRuntimeSessionAgentVisibleContext(input, jsonlRuntimeSessionStorageProvider);
  };

  recordSessionEvent: RuntimeSessionProvider["recordSessionEvent"] = (input) => {
    return recordRuntimeSessionEvent(input, jsonlRuntimeSessionStorageProvider);
  };

  appendTraceRecord: RuntimeSessionProvider["appendTraceRecord"] = async (input) => {
    const handle = await jsonlRuntimeSessionStorageProvider.openOrCreate(input);
    return handle.appendTrace(input.record);
  };

  resolveArtifactDir: RuntimeSessionProvider["resolveArtifactDir"] = (input) => {
    return resolveRuntimeSessionArtifactDir(jsonlRuntimeSessionStorageProvider, input, input.segments);
  };

  clearArtifactDir: RuntimeSessionProvider["clearArtifactDir"] = (input) => {
    return clearRuntimeSessionArtifactDir(jsonlRuntimeSessionStorageProvider, input, input.segments);
  };

  listRuntimeSessions: RuntimeSessionProvider["listRuntimeSessions"] = (input) => {
    return listRuntimeSessions(input);
  };

  getRuntimeSessionSnapshot: RuntimeSessionProvider["getRuntimeSessionSnapshot"] = (target, options) => {
    return getRuntimeSessionSnapshot(target, options);
  };

  getRuntimeSessionDebugSnapshot: RuntimeSessionProvider["getRuntimeSessionDebugSnapshot"] = (target, options) => {
    return getRuntimeSessionDebugSnapshot(target, options);
  };

  getCollaborationTimeline: RuntimeSessionProvider["getCollaborationTimeline"] = (target, options) => {
    return getCollaborationTimeline(target, options);
  };
}

export const jsonlRuntimeSessionProvider = new JsonlRuntimeSessionProvider();
