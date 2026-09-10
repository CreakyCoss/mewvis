import { lstatSync, readlinkSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export const containsPath = (root: string, path: string) => {
  const rel = relative(root, path);
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
};

/** Resolve symlinks, including existing parents of files not created yet. */
export function canonicalPath(path: string): string {
  return resolvePath(resolve(path), new Set());
}

function resolvePath(path: string, links: Set<string>): string {
  try {
    return realpathSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    // realpath fails on dangling links, but a write would still follow the link
    // and create its target. Resolve that target before classifying the write.
    try {
      if (lstatSync(path).isSymbolicLink()) {
        if (links.has(path) || links.size >= 40) throw new Error("文件路径包含循环符号链接。");
        links.add(path);
        return resolvePath(resolve(dirname(path), readlinkSync(path)), links);
      }
    } catch (linkError) {
      if ((linkError as NodeJS.ErrnoException).code !== "ENOENT") throw linkError;
    }
    const parent = dirname(path);
    if (parent === path) throw error;
    return resolve(resolvePath(parent, links), relative(parent, path));
  }
}
