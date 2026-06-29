import { appendFile, readFile } from "node:fs/promises";

export type RuntimeSessionTraceRecord = {
  type: string;
  timestamp?: string;
  [key: string]: unknown;
};

const withTimestamp = <TRecord extends RuntimeSessionTraceRecord>(
  record: TRecord,
): TRecord & { timestamp: string } => ({
  ...record,
  timestamp: record.timestamp ?? new Date().toISOString(),
});

export const appendRuntimeSessionTraceRecord = async <
  TRecord extends RuntimeSessionTraceRecord,
>(
  tracePath: string,
  record: TRecord,
): Promise<TRecord & { timestamp: string }> => {
  const nextRecord = withTimestamp(record);
  await appendFile(tracePath, `${JSON.stringify(nextRecord)}\n`, "utf8");
  return nextRecord;
};

export const readRuntimeSessionTraceRecords = async (
  tracePath: string,
): Promise<RuntimeSessionTraceRecord[]> => {
  const content = await readFile(tracePath, "utf8").catch((error: unknown) => {
    if (
      error &&
      typeof error === "object" &&
      (error as { code?: unknown }).code === "ENOENT"
    ) {
      return "";
    }
    throw error;
  });
  return content
    .split("\n")
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line) as RuntimeSessionTraceRecord;
      } catch (error: unknown) {
        throw new Error(`无法解析 runtime trace：${tracePath}:${index + 1} ${String(error)}`);
      }
    });
};
