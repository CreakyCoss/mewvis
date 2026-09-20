import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import product from "../../../../product.config.json" with { type: "json" };
import { EXECUTION_CONFIG } from "./policy.js";

const settingsSchema = z.object({ enabled: z.boolean() }).strict();
const settingsPath = () =>
  process.env.ISLE_SANDBOX_SETTINGS_PATH ??
  join(homedir(), product.appDataDirName, "sandbox.json");

/** Read per run so existing runtime processes see changes without changing active snapshots. */
export function readExecutionConfig(platform = process.platform) {
  let enabled = platform === "win32" ? false : EXECUTION_CONFIG.enabled;
  try {
    enabled = settingsSchema.parse(
      JSON.parse(readFileSync(settingsPath(), "utf8")),
    ).enabled;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return {
    ...EXECUTION_CONFIG,
    enabled,
    baseline: {
      ...EXECUTION_CONFIG.baseline,
      // An isolated tool must not change the user's choice for subsequent runs.
      denyWrite: [...EXECUTION_CONFIG.baseline.denyWrite, settingsPath()],
    },
  };
}

export function saveSandboxEnabled(enabled: boolean) {
  const settings = settingsSchema.parse({ enabled });
  const path = settingsPath();
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(settings)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}
