import * as fs from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { nonempty, invalid } from "../../shared/validation.js";
export async function exists(path: string) {
  try {
    await fs.lstat(path);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw e;
  }
}
export async function root(value: unknown) {
  const input = nonempty(value, "workspacePath");
  if (!isAbsolute(input)) invalid("工作区必须是绝对路径");
  const path = await fs.realpath(input);
  if (!(await fs.stat(path)).isDirectory()) invalid("工作区必须是目录");
  return path;
}
export function relativePath(value: unknown) {
  const path = nonempty(value, "relativePath").replaceAll("\\", "/");
  if (
    isAbsolute(path) ||
    /^[a-z]:/i.test(path) ||
    path.split("/").includes("..") ||
    path.includes("\0")
  )
    invalid("路径必须位于工作区内");
  const normalized = path
    .split("/")
    .filter((p) => p && p !== ".")
    .join("/");
  if (!normalized) invalid("文件路径不能为空");
  return normalized;
}
export function under(base: string, path: string, allowRoot = false) {
  const child = relative(base, path);
  if (
    (!child && !allowRoot) ||
    child === ".." ||
    child.startsWith(`..${sep}`) ||
    isAbsolute(child)
  )
    invalid("路径必须位于工作区内");
}
export async function safePath(base: string, rel: unknown, allowRoot = false) {
  const path = resolve(base, relativePath(rel));
  under(base, path, allowRoot);
  let parent = path;
  const parts: string[] = [];
  while (!(await exists(parent))) {
    parts.unshift(parent.slice(dirname(parent).length).replace(/^[/\\]/, ""));
    parent = dirname(parent);
  }
  const canonical = resolve(await fs.realpath(parent), ...parts);
  under(base, canonical, allowRoot);
  return canonical;
}
