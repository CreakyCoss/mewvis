import { mkdir } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

export type BridgeSessionPaths = {
  sessionDir: string;
  ledgerPath: string;
  contextPath: string;
  tracePath: string;
  agentsDir: string;
};

export type BridgeSessionPathInput = {
  workspacePath: string;
  sessionRootDir: string;
};

const resolveSessionRootDir = (sessionRootDir: string) => {
  const raw = sessionRootDir.trim();
  if (!raw) {
    throw new Error("bridge sessionRootDir 不能为空");
  }
  if (!isAbsolute(raw)) {
    throw new Error("bridge sessionRootDir 必须是最终绝对目录");
  }

  return resolve(raw);
};

export const resolveBridgeSessionPaths = async (
  input: BridgeSessionPathInput,
): Promise<BridgeSessionPaths> => {
  const rawWorkspacePath = input.workspacePath.trim();
  if (!rawWorkspacePath) {
    throw new Error("bridge workspacePath 不能为空");
  }

  const sessionDir = resolveSessionRootDir(input.sessionRootDir);
  await mkdir(sessionDir, { recursive: true });

  const agentsDir = resolve(sessionDir, "agents");
  await mkdir(agentsDir, { recursive: true });

  return {
    sessionDir,
    ledgerPath: resolve(sessionDir, "ledger.jsonl"),
    contextPath: resolve(sessionDir, "context.json"),
    tracePath: resolve(sessionDir, "trace.jsonl"),
    agentsDir,
  };
};
