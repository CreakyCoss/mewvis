import { mkdir } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type { RuntimeSessionPathInput, RuntimeSessionPaths } from "../types.js";

export type JsonlRuntimeSessionPaths = RuntimeSessionPaths & {
  ledgerPath: string;
  tracePath: string;
};

const resolveSessionRootDir = (sessionRootDir: string) => {
  const raw = sessionRootDir.trim();
  if (!raw) {
    throw new Error("runtime sessionRootDir 不能为空");
  }
  if (!isAbsolute(raw)) {
    throw new Error("runtime sessionRootDir 必须是最终绝对目录");
  }

  return resolve(raw);
};

export const resolveRuntimeSessionPaths = async (input: RuntimeSessionPathInput): Promise<JsonlRuntimeSessionPaths> => {
  const rawWorkspacePath = input.workspacePath.trim();
  if (!rawWorkspacePath) {
    throw new Error("runtime workspacePath 不能为空");
  }

  const sessionDir = resolveSessionRootDir(input.sessionRootDir);
  await mkdir(sessionDir, { recursive: true });

  return {
    sessionDir,
    artifactsDir: sessionDir,
    ledgerPath: resolve(sessionDir, "ledger.jsonl"),
    tracePath: resolve(sessionDir, "trace.jsonl"),
  };
};
