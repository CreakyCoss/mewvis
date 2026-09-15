import { readdir, stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type { RuntimeSessionSummary, RuntimeTimelineItem } from "../../../../../protocol/wire.js";
import type {
  RuntimeSessionDebugSnapshot,
  RuntimeSessionListOptions,
  RuntimeSessionQueryTarget,
  RuntimeSessionSnapshot,
} from "../../providers/types.js";
import type { RuntimeSessionTraceRecord } from "../types.js";
import { RuntimeLedgerStorage } from "./store.js";
import { readRuntimeSessionTraceRecords } from "./trace.js";
import {
  buildRuntimeSessionManifest,
  readFreshRuntimeSessionManifest,
  refreshRuntimeSessionManifest,
  type RuntimeSessionSummaryLike,
} from "./manifest.js";

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object";

const stringValue = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

const normalizeAbsoluteDir = (value: string, label: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} 不能为空`);
  }
  if (!isAbsolute(trimmed)) {
    throw new Error(`${label} 必须是绝对路径`);
  }
  return resolve(trimmed);
};

const runtimeSessionPaths = (target: RuntimeSessionQueryTarget) => {
  const sessionRootDir = normalizeAbsoluteDir(target.sessionRootDir, "runtime sessionRootDir");
  return {
    sessionRootDir,
    ledgerPath: resolve(sessionRootDir, "ledger.jsonl"),
    tracePath: resolve(sessionRootDir, "trace.jsonl"),
  };
};

const isNotFoundError = (error: unknown) => isRecord(error) && error.code === "ENOENT";

const openLedgerOrNull = async (ledgerPath: string) => {
  try {
    return await RuntimeLedgerStorage.open(ledgerPath);
  } catch (error: unknown) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }
};

const collaborationRecordParts = (record: RuntimeSessionTraceRecord) => {
  if (record.type !== "collaboration_event" || !isRecord(record.event)) {
    return null;
  }
  return {
    workflowRunId: stringValue(record.workflowRunId),
    workflowId: stringValue(record.workflowId),
    modeId: stringValue(record.modeId),
    event: record.event,
  };
};

const summaryFromManifest = (manifest: RuntimeSessionSummaryLike): RuntimeSessionSummary => ({
  workspacePath: manifest.workspacePath,
  sessionRootDir: manifest.sessionRootDir,
  sessionId: manifest.sessionId ?? null,
  createdAt: manifest.createdAt ?? null,
  updatedAt: manifest.updatedAt ?? null,
  leafId: manifest.leafId ?? null,
  entryCount: manifest.entryCount,
  traceCount: manifest.traceCount,
  workflowRunIds: manifest.workflowRunIds,
  workflowIds: manifest.workflowIds,
  modeIds: manifest.modeIds,
  latestWorkflowRunId: manifest.latestWorkflowRunId ?? null,
});

const summarizeSession = async (
  target: RuntimeSessionQueryTarget,
  options: {
    preferFreshManifest?: boolean;
  } = {},
): Promise<{
  summary: RuntimeSessionSummary;
  ledger: RuntimeLedgerStorage | null;
  trace: RuntimeSessionTraceRecord[];
}> => {
  const paths = runtimeSessionPaths(target);
  if (options.preferFreshManifest) {
    const manifest = await readFreshRuntimeSessionManifest(paths);
    if (manifest) {
      return {
        summary: summaryFromManifest(manifest),
        ledger: null,
        trace: [],
      };
    }
  }

  const ledger = await openLedgerOrNull(paths.ledgerPath);
  const trace = await readRuntimeSessionTraceRecords(paths.tracePath);
  const manifest = buildRuntimeSessionManifest({
    workspacePath: target.workspacePath,
    sessionRootDir: paths.sessionRootDir,
    ledgerPath: paths.ledgerPath,
    tracePath: paths.tracePath,
    ledger,
    trace,
  });
  if (ledger || trace.length > 0) {
    await refreshRuntimeSessionManifest({
      workspacePath: target.workspacePath,
      sessionRootDir: paths.sessionRootDir,
      ledgerPath: paths.ledgerPath,
      tracePath: paths.tracePath,
      ledger,
      trace,
    });
  }

  return {
    summary: summaryFromManifest(manifest),
    ledger,
    trace,
  };
};

const timelineStatusFor = (type: string): RuntimeTimelineItem["status"] => {
  if (type.endsWith("_started")) {
    return "started";
  }
  if (type.endsWith("_done") || type === "collaboration_result" || type === "done") {
    return "done";
  }
  if (type.endsWith("_skipped")) {
    return "skipped";
  }
  if (type === "error" || type.endsWith("_error")) {
    return "error";
  }
  return null;
};

const collaborationTimelineItem = (record: RuntimeSessionTraceRecord, index: number): RuntimeTimelineItem | null => {
  const parts = collaborationRecordParts(record);
  if (!parts) {
    return null;
  }
  const event = parts.event;
  const type = stringValue(event.type) ?? "collaboration_event";
  const step = isRecord(event.step) ? event.step : null;
  const nestedEvent = isRecord(event.event) ? event.event : null;

  return {
    id: `${parts.workflowRunId ?? "workflow"}:${index}`,
    index,
    source: "collaboration",
    type,
    timestamp: record.timestamp ?? null,
    taskId: stringValue(event.taskId),
    workflowRunId: parts.workflowRunId,
    workflowId: parts.workflowId,
    modeId: parts.modeId,
    stepId: stringValue(event.stepId) ?? stringValue(step?.stepId),
    stepType: stringValue(event.stepType) ?? stringValue(step?.stepType),
    agentRoleId: stringValue(event.agentRoleId) ?? stringValue(step?.agentRoleId),
    agentTaskId: stringValue(event.agentTaskId) ?? stringValue(step?.agentTaskId),
    status: timelineStatusFor(type),
    detail:
      stringValue(event.message) ??
      stringValue(nestedEvent?.type) ??
      stringValue(step?.route) ??
      stringValue(step?.outputKey),
  };
};

const runtimeTimelineItem = (record: RuntimeSessionTraceRecord, index: number): RuntimeTimelineItem => {
  const event = isRecord(record.event) ? record.event : null;
  const type = stringValue(event?.type) ?? record.type;
  return {
    id: `runtime:${index}`,
    index,
    source: event ? "agent" : "runtime",
    type,
    timestamp: record.timestamp ?? null,
    taskId: stringValue(record.taskId) ?? stringValue(event?.taskId),
    status: timelineStatusFor(type),
    detail: stringValue(record.message) ?? stringValue(event?.toolName),
  };
};

export const buildRuntimeSessionTimeline = (
  trace: RuntimeSessionTraceRecord[],
  options: {
    workflowRunId?: string | null;
    limit?: number | null;
  } = {},
) => {
  const timeline = trace.flatMap((record, index) => {
    const collaborationItem = collaborationTimelineItem(record, index);
    const item = collaborationItem ?? runtimeTimelineItem(record, index);
    if (options.workflowRunId && item.workflowRunId !== options.workflowRunId) {
      return [];
    }
    return [item];
  });
  const limit = typeof options.limit === "number" && options.limit > 0 ? Math.floor(options.limit) : null;
  return limit ? timeline.slice(-limit) : timeline;
};

export const getRuntimeSessionSnapshot = async (
  target: RuntimeSessionQueryTarget,
  options: {
    includeTimeline?: boolean | null;
    timelineLimit?: number | null;
  } = {},
): Promise<RuntimeSessionSnapshot> => {
  const { summary, trace } = await summarizeSession(target);
  return {
    session: summary,
    timeline: options.includeTimeline
      ? buildRuntimeSessionTimeline(trace, { limit: options.timelineLimit })
      : undefined,
  };
};

export const getRuntimeSessionDebugSnapshot = async (
  target: RuntimeSessionQueryTarget,
  options: {
    includeLedger?: boolean | null;
    includeTrace?: boolean | null;
    traceLimit?: number | null;
  } = {},
): Promise<RuntimeSessionDebugSnapshot> => {
  const { summary, ledger, trace } = await summarizeSession(target);
  const hasExplicitSelection = typeof options.includeLedger === "boolean" || typeof options.includeTrace === "boolean";
  const includeLedger = hasExplicitSelection ? options.includeLedger === true : true;
  const includeTrace = hasExplicitSelection ? options.includeTrace === true : true;
  const traceLimit =
    typeof options.traceLimit === "number" && options.traceLimit > 0 ? Math.floor(options.traceLimit) : null;

  return {
    session: summary,
    ledger: includeLedger
      ? ledger && {
          header: ledger.header,
          entries: ledger.getEntries(),
        }
      : undefined,
    trace: includeTrace ? (traceLimit ? trace.slice(-traceLimit) : trace) : undefined,
  };
};

export const getCollaborationTimeline = async (
  target: RuntimeSessionQueryTarget,
  options: {
    workflowRunId?: string | null;
    limit?: number | null;
  } = {},
) => {
  const { summary, trace } = await summarizeSession(target);
  return {
    session: summary,
    workflowRunId: options.workflowRunId ?? null,
    events: buildRuntimeSessionTimeline(trace, options).filter((item) => item.source === "collaboration"),
  };
};

const hasRuntimeSessionFiles = async (dir: string) => {
  const [manifest, ledger, trace] = await Promise.all([
    stat(resolve(dir, "session.json"))
      .then(() => true)
      .catch((error: unknown) => {
        if (isNotFoundError(error)) {
          return false;
        }
        throw error;
      }),
    stat(resolve(dir, "ledger.jsonl"))
      .then(() => true)
      .catch((error: unknown) => {
        if (isNotFoundError(error)) {
          return false;
        }
        throw error;
      }),
    stat(resolve(dir, "trace.jsonl"))
      .then(() => true)
      .catch((error: unknown) => {
        if (isNotFoundError(error)) {
          return false;
        }
        throw error;
      }),
  ]);
  return manifest || ledger || trace;
};

const findRuntimeSessionDirs = async (rootDir: string, maxDepth: number): Promise<string[]> => {
  const normalizedRoot = normalizeAbsoluteDir(rootDir, "runtime session rootDir");
  if (await hasRuntimeSessionFiles(normalizedRoot)) {
    return [normalizedRoot];
  }
  if (maxDepth <= 0) {
    return [];
  }

  const children = await readdir(normalizedRoot, { withFileTypes: true }).catch((error: unknown) => {
    if (isNotFoundError(error)) {
      return [];
    }
    throw error;
  });
  const nested = await Promise.all(
    children
      .filter((entry) => entry.isDirectory() && entry.name !== "agents")
      .map((entry) => findRuntimeSessionDirs(resolve(normalizedRoot, entry.name), maxDepth - 1)),
  );
  return nested.flat();
};

export const listRuntimeSessions = async (options: RuntimeSessionListOptions) => {
  const maxDepth = typeof options.maxDepth === "number" ? Math.max(0, Math.floor(options.maxDepth)) : 6;
  const limit = typeof options.limit === "number" && options.limit > 0 ? Math.floor(options.limit) : null;
  const sessionDirs = await findRuntimeSessionDirs(options.rootDir, maxDepth);
  const sessions = await Promise.all(
    sessionDirs.map((sessionRootDir) =>
      summarizeSession(
        {
          workspacePath: options.workspacePath,
          sessionRootDir,
        },
        {
          preferFreshManifest: true,
        },
      ).then((result) => result.summary),
    ),
  );
  const sorted = sessions.sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""));
  return limit ? sorted.slice(0, limit) : sorted;
};
