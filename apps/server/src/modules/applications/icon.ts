import { open, stat } from "node:fs/promises";
import { extname } from "node:path";
import { root, safePath } from "../../infrastructure/filesystem/paths.js";

const MAX_ICON_BYTES = 256 * 1024;
const MIME_TYPES: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

export function applicationIconEntry(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    !value.startsWith("./") ||
    value.includes("\0") ||
    value.includes("\\") ||
    value.split(/[\\/]/).includes("..") ||
    !Object.hasOwn(MIME_TYPES, extname(value).toLowerCase())
  )
    return null;
  return value;
}

/** Icons are optional presentation assets; a bad icon must not break the application. */
export async function readApplicationIcon(
  packageRoot: string,
  entry: unknown,
): Promise<string | null> {
  const icon = applicationIconEntry(entry);
  if (!icon) return null;
  const mime = MIME_TYPES[extname(icon).toLowerCase()];
  try {
    const path = await safePath(await root(packageRoot), icon);
    if (!(await stat(path)).isFile()) return null;
    const file = await open(path, "r");
    try {
      const metadata = await file.stat();
      if (
        !metadata.isFile() ||
        metadata.size === 0 ||
        metadata.size > MAX_ICON_BYTES
      )
        return null;
      // Bound the read even if the file grows after stat().
      const buffer = Buffer.alloc(MAX_ICON_BYTES + 1);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      if (!bytesRead || bytesRead > MAX_ICON_BYTES) return null;
      return `data:${mime};base64,${buffer.subarray(0, bytesRead).toString("base64")}`;
    } finally {
      await file.close();
    }
  } catch {
    return null;
  }
}
