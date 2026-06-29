import { readdir, stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type {
  BridgeLedgerEntry,
  BridgeLedgerHeader,
} from "../core/types.js";
import { BridgeLedgerStorage } from "../storage/jsonl-store.js";
import {
  readRuntimeSessionTraceRecords,
  type RuntimeSessionTraceRecord,
} from "../trace/jsonl-trace.js";

export type RuntimeSessionQueryTarget = {
  workspacePath: string;
  sessionRootDir: string;
};

export type RuntimeSessionSummary = {
  workspacePath: string;
  sessionRootDir: string;
  ledgerPath: string;
  tracePath: string;
  sessionId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  leafId?: string | null;
  entryCount: number;
  traceCount: number;
  workflowRunIds: string[];
  workflowIds: string[];
  modeIds: string[];
  latestWorkflowRunId?: string | null;
};

export type RuntimeSessionTimelineItem = {
  id: string;
  index: number;
  source: "agent" | "collaboration" | "runtime";
  type: string;
  timestamp?: string | null;
  taskId?: string | null;
  workflowRunId?: string | null;
  workflowId?: string | null;
  modeId?: string | null;
  stepId?: string | null;
  stepType?: string | null;
  agentRoleId?: string | null;
  agentTaskId?: string | null;
  status?: "started" | "done" | "skipped" | "error" | null;
  detail?: string | null;
  payload?: unknown;
};

export type RuntimeSessionSnapshot = {
  session: RuntimeSessionSummary;
  ledger?: {
    header: BridgeLedgerHeader;
    entries: BridgeLedgerEntry[];
  } | null;
  trace?: RuntimeSessionTraceRecord[];
  timeline?: RuntimeSessionTimelineItem[];
};

export type RuntimeSessionListOptions = {
  workspacePath: string;
  rootDir: string;
  limit?: number | null;
  maxDepth?: number | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object";

const stringValue = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

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

const isNotFoundError = (error: unknown) =>
  isRecord(error) && error.code === "ENOENT";

const openLedgerOrNull = async (ledgerPath: string) => {
  try {
    return await BridgeLedgerStorage.open(ledgerPath);
  } catch (error: unknown) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }
};

const timestampOfEntry = (entry: BridgeLedgerEntry) =>
  typeof entry.timestamp === "string" ? entry.timestamp : null;

const latestTimestamp = (timestamps: Array<string | null | undefined>) =>
  timestamps
    .filter((timestamp): timestamp is string => Boolean(timestamp))
    .sort()
    .at(-1) ?? null;

const orderedUnique = (values: Array<string | null | undefined>) =>
  [...new Set(values.filter((value): value is string => Boolean(value)))];

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

const summarizeTrace = (trace: RuntimeSessionTraceRecord[]) => {
  const parts = trace.flatMap((record) => {
    const part = collaborationRecordParts(record);
    return part ? [part] : [];
  });
  return {
    workflowRunIds: orderedUnique(parts.map((part) => part.workflowRunId)),
    workflowIds: orderedUnique(parts.map((part) => part.workflowId)),
    modeIds: orderedUnique(parts.map((part) => part.modeId)),
    latestWorkflowRunId: parts.at(-1)?.workflowRunId ?? null,
  };
};

const summarizeSession = async (
  target: RuntimeSessionQueryTarget,
): Promise<{
  summary: RuntimeSessionSummary;
  ledger: BridgeLedgerStorage | null;
  trace: RuntimeSessionTraceRecord[];
}> => {
  const paths = runtimeSessionPaths(target);
  const ledger = await openLedgerOrNull(paths.ledgerPath);
  const trace = await readRuntimeSessionTraceRecords(paths.tracePath);
  const entries = ledger?.getEntries() ?? [];
  const traceSummary = summarizeTrace(trace);

  return {
    summary: {
      workspacePath: target.workspacePath,
      sessionRootDir: paths.sessionRootDir,
      ledgerPath: paths.ledgerPath,
      tracePath: paths.tracePath,
      sessionId: ledger?.header.id ?? null,
      createdAt: ledger?.header.timestamp ?? null,
      updatedAt: latestTimestamp([
        ledger?.header.timestamp,
        ...entries.map(timestampOfEntry),
        ...trace.map((record) => record.timestamp),
      ]),
      leafId: ledger?.getLeafId() ?? null,
      entryCount: entries.length,
      traceCount: trace.length,
      ...traceSummary,
    },
    ledger,
    trace,
  };
};

const timelineStatusFor = (type: string): RuntimeSessionTimelineItem["status"] => {
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

const collaborationTimelineItem = (
  record: RuntimeSessionTraceRecord,
  index: number,
): RuntimeSessionTimelineItem | null => {
  const parts = collaborationRecordParts(record);
  if (!parts) {
    return null;
  }
  const event = parts.event;
  const type = stringValue(event.type) ?? "collaboration_event";
  const step = isRecord(event.step) ? event.step : null;

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
    detail: stringValue(event.message) ??
      stringValue(step?.route) ??
      stringValue(step?.outputKey),
    payload: event,
  };
};

const runtimeTimelineItem = (
  record: RuntimeSessionTraceRecord,
  index: number,
): RuntimeSessionTimelineItem => {
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
    payload: event ?? record,
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
    if (
      options.workflowRunId &&
      item.workflowRunId !== options.workflowRunId
    ) {
      return [];
    }
    return [item];
  });
  const limit = typeof options.limit === "number" && options.limit > 0
    ? Math.floor(options.limit)
    : null;
  return limit ? timeline.slice(-limit) : timeline;
};

export const getRuntimeSessionSnapshot = async (
  target: RuntimeSessionQueryTarget,
  options: {
    includeLedger?: boolean | null;
    includeTrace?: boolean | null;
    includeTimeline?: boolean | null;
    timelineLimit?: number | null;
  } = {},
): Promise<RuntimeSessionSnapshot> => {
  const { summary, ledger, trace } = await summarizeSession(target);
  return {
    session: summary,
    ledger: options.includeLedger
      ? ledger && {
          header: ledger.header,
          entries: ledger.getEntries(),
        }
      : undefined,
    trace: options.includeTrace ? trace : undefined,
    timeline: options.includeTimeline
      ? buildRuntimeSessionTimeline(trace, { limit: options.timelineLimit })
      : undefined,
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
    events: buildRuntimeSessionTimeline(trace, options).filter((item) =>
      item.source === "collaboration"
    ),
  };
};

const hasRuntimeSessionFiles = async (dir: string) => {
  const [ledger, trace] = await Promise.all([
    stat(resolve(dir, "ledger.jsonl")).then(() => true).catch((error: unknown) => {
      if (isNotFoundError(error)) {
        return false;
      }
      throw error;
    }),
    stat(resolve(dir, "trace.jsonl")).then(() => true).catch((error: unknown) => {
      if (isNotFoundError(error)) {
        return false;
      }
      throw error;
    }),
  ]);
  return ledger || trace;
};

const findRuntimeSessionDirs = async (
  rootDir: string,
  maxDepth: number,
): Promise<string[]> => {
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

export const listRuntimeSessions = async (
  options: RuntimeSessionListOptions,
) => {
  const maxDepth = typeof options.maxDepth === "number"
    ? Math.max(0, Math.floor(options.maxDepth))
    : 6;
  const limit = typeof options.limit === "number" && options.limit > 0
    ? Math.floor(options.limit)
    : null;
  const sessionDirs = await findRuntimeSessionDirs(options.rootDir, maxDepth);
  const sessions = await Promise.all(
    sessionDirs.map((sessionRootDir) =>
      summarizeSession({
        workspacePath: options.workspacePath,
        sessionRootDir,
      }).then((result) => result.summary)
    ),
  );
  const sorted = sessions.sort((left, right) =>
    (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "")
  );
  return limit ? sorted.slice(0, limit) : sorted;
};
