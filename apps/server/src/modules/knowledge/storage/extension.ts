import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { getLoadablePath } from "sqlite-vec";

/** Windows ARM64 uses the same sqlite-vec source compiled during packaging. */
export function sqliteVecPath(
  platform = process.platform,
  arch = process.arch,
  resources = process.env.MEWVIS_SERVER_RESOURCES,
): string {
  if (platform === "win32" && arch === "arm64") {
    const root =
      resources ??
      fileURLToPath(
        new URL("../../../../../agent-runtime/dist/", import.meta.url),
      );
    return join(root, "server/native/vec0.dll");
  }
  return getLoadablePath();
}
