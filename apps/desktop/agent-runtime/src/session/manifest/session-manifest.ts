import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  BridgeLedgerEntry,
  BridgeLedgerHeader,
} from "../core/types.js";
import { BridgeLedgerStorage } from "../storage/jsonl-store.js";
import {
  readRuntimeSessionTraceRecords,
  type RuntimeSessionTraceRecord,
} from "../trace/jsonl-trace.js";

export type RuntimeSessionManifest = {
  type: "runtime_session_manifest";
  version: 1;
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

export type RuntimeSessionSummaryLike = Omit<RuntimeSessionManifest, "type" | "version">;

type RuntimeSessionManifestInput = {
  workspacePath: string;
  sessionRootDir: string;
  ledgerPath: string;
  tracePath: string;
  ledger?: BridgeLedgerStorage | null;
  trace?: RuntimeSessionTraceRecord[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object";

const isNotFoundError = (error: unknown) =>
  isRecord(error) && error.code === "ENOENT";

const stringValue = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

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

const isRuntimeSessionManifest = (value: unknown): value is RuntimeSessionManifest =>
  isRecord(value) &&
  value.type === "runtime_session_manifest" &&
  value.version === 1 &&
  typeof value.workspacePath === "string" &&
  typeof value.sessionRootDir === "string" &&
  typeof value.ledgerPath === "string" &&
  typeof value.tracePath === "string" &&
  typeof value.entryCount === "number" &&
  typeof value.traceCount === "number" &&
  Array.isArray(value.workflowRunIds) &&
  Array.isArray(value.workflowIds) &&
  Array.isArray(value.modeIds);

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

const fileMtimeMs = async (filePath: string) =>
  stat(filePath).then((info) => info.mtimeMs).catch((error: unknown) => {
    if (isNotFoundError(error)) {
      return 0;
    }
    throw error;
  });

export const runtimeSessionManifestPath = (sessionRootDir: string) =>
  resolve(sessionRootDir, "session.json");

export const readRuntimeSessionManifest = async (
  sessionRootDir: string,
): Promise<RuntimeSessionManifest | null> => {
  const manifestPath = runtimeSessionManifestPath(sessionRootDir);
  const content = await readFile(manifestPath, "utf8").catch((error: unknown) => {
    if (isNotFoundError(error)) {
      return "";
    }
    throw error;
  });
  if (!content.trim()) {
    return null;
  }
  const parsed = JSON.parse(content) as unknown;
  if (!isRuntimeSessionManifest(parsed)) {
    throw new Error(`runtime session manifest 不合法：${manifestPath}`);
  }
  return parsed;
};

export const isRuntimeSessionManifestFresh = async (input: {
  sessionRootDir: string;
  ledgerPath: string;
  tracePath: string;
}) => {
  const manifestPath = runtimeSessionManifestPath(input.sessionRootDir);
  const [manifestMtime, ledgerMtime, traceMtime] = await Promise.all([
    fileMtimeMs(manifestPath),
    fileMtimeMs(input.ledgerPath),
    fileMtimeMs(input.tracePath),
  ]);
  return manifestMtime > 0 && manifestMtime >= Math.max(ledgerMtime, traceMtime);
};

export const readFreshRuntimeSessionManifest = async (input: {
  sessionRootDir: string;
  ledgerPath: string;
  tracePath: string;
}) => {
  const manifest = await readRuntimeSessionManifest(input.sessionRootDir);
  if (!manifest) {
    return null;
  }
  return await isRuntimeSessionManifestFresh(input) ? manifest : null;
};

export const buildRuntimeSessionManifest = ({
  workspacePath,
  sessionRootDir,
  ledgerPath,
  tracePath,
  ledger,
  trace = [],
}: RuntimeSessionManifestInput): RuntimeSessionManifest => {
  const entries = ledger?.getEntries() ?? [];
  return {
    type: "runtime_session_manifest",
    version: 1,
    workspacePath,
    sessionRootDir,
    ledgerPath,
    tracePath,
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
    ...summarizeTrace(trace),
  };
};

export const refreshRuntimeSessionManifest = async (
  input: RuntimeSessionManifestInput,
) => {
  const ledger = input.ledger ?? await openLedgerOrNull(input.ledgerPath);
  const trace = input.trace ?? await readRuntimeSessionTraceRecords(input.tracePath);
  const manifest = buildRuntimeSessionManifest({
    ...input,
    ledger,
    trace,
  });
  await mkdir(input.sessionRootDir, { recursive: true });
  await writeFile(
    runtimeSessionManifestPath(input.sessionRootDir),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return manifest;
};
