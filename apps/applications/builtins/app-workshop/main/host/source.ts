import { constants } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rename,
  rm,
  rmdir,
} from "node:fs/promises";
import { dirname, join, sep } from "node:path";
import { randomUUID } from "node:crypto";
import {
  FILE_LIMIT,
  PROJECT_LIMIT,
  SOURCE_DIRECTORY,
  SOURCE_LIMIT,
  validateFileName,
  type FileMap,
} from "../contracts.js";

const missing = (error: unknown) =>
  error &&
  typeof error === "object" &&
  "code" in error &&
  error.code === "ENOENT";

export function validateFiles(files: FileMap) {
  if (
    !files ||
    typeof files !== "object" ||
    Array.isArray(files) ||
    Object.keys(files).length > FILE_LIMIT
  )
    throw new Error(`项目最多保存 ${FILE_LIMIT} 个源码文件。`);
  let size = 0;
  for (const [name, source] of Object.entries(files)) {
    validateFileName(name);
    if (typeof source !== "string" || Buffer.byteLength(source) > SOURCE_LIMIT)
      throw new Error("单个源码文件最多 128 KiB。");
    size += Buffer.byteLength(source);
  }
  if (size > PROJECT_LIMIT) throw new Error("项目源码总量最多 1 MiB。");
}

async function checkedDirectory(path: string) {
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error("源码目录不能是符号链接或普通文件。");
}

export async function sourceDirectory(workshop: string, create = false) {
  const workspace = dirname(workshop);
  const path = join(workspace, SOURCE_DIRECTORY);
  if (create) await mkdir(path, { recursive: true });
  await checkedDirectory(path);
  if (
    (await realpath(path)) !== join(await realpath(workspace), SOURCE_DIRECTORY)
  )
    throw new Error("源码目录不能越过当前工作区。");
  return path;
}

async function readText(path: string) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await file.stat();
    if (!before.isFile() || before.nlink !== 1 || before.size > SOURCE_LIMIT)
      throw new Error("源码文件无效、存在硬链接或超过 128 KiB。");
    const content = new TextDecoder("utf-8", { fatal: true }).decode(
      await file.readFile(),
    );
    const after = await file.stat();
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs)
      throw new Error("源码正在被外部编辑器修改，请稍后重试。");
    return content;
  } finally {
    await file.close();
  }
}

// These are editor/dependency/build data, not authored source. Never follow them.
const ignored = new Set([".git", "node_modules", "dist", ".DS_Store"]);
export async function readSource(
  workshop: string,
  allowMissing = false,
): Promise<FileMap> {
  let root: string;
  try {
    root = await sourceDirectory(workshop);
  } catch (error) {
    if (allowMissing && missing(error)) return {};
    throw error;
  }
  const files: FileMap = Object.create(null);
  async function visit(directory: string, prefix: string) {
    await checkedDirectory(directory);
    for (const name of (await readdir(directory)).sort()) {
      if (ignored.has(name)) continue;
      const path = join(directory, name);
      const relative = prefix + name;
      const stat = await lstat(path);
      if (stat.isSymbolicLink())
        throw new Error(`源码不能包含符号链接：${relative}`);
      if (stat.isDirectory()) {
        if (!/^[a-zA-Z0-9_-]+$/.test(name) || relative.length > 128)
          throw new Error(`源码目录名无效：${relative}`);
        await visit(path, relative + "/");
      } else {
        validateFileName(relative);
        files[relative] = await readText(path);
        validateFiles(files);
      }
    }
  }
  await visit(root, "");
  return files;
}

async function targetPath(root: string, name: string, create = false) {
  validateFileName(name);
  let parent = root;
  const parts = name.split("/");
  for (const part of parts.slice(0, -1)) {
    parent = join(parent, part);
    if (create) await mkdir(parent, { recursive: true });
    await checkedDirectory(parent);
    if (!(await realpath(parent)).startsWith(root + sep))
      throw new Error("源码路径不能越界。");
  }
  const path = join(parent, parts.at(-1)!);
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
      throw new Error("源码文件不能是符号链接、硬链接或目录。");
  } catch (error) {
    if (!missing(error)) throw error;
  }
  return path;
}
async function currentText(root: string, name: string) {
  try {
    return await readText(await targetPath(root, name));
  } catch (error) {
    if (missing(error)) return undefined;
    throw error;
  }
}

async function writeText(
  workshop: string,
  root: string,
  name: string,
  content: string,
  before: string | undefined,
) {
  const path = await targetPath(root, name, true);
  const temporary = join(workshop, `.file-write-${randomUUID()}`);
  const file = await open(temporary, "wx", 0o600);
  try {
    await file.writeFile(content);
    await file.sync();
  } finally {
    await file.close();
  }
  try {
    await targetPath(root, name);
    const latest = await currentText(root, name);
    if (latest !== before && latest !== content)
      throw new Error(`源码在保存期间被外部修改，已保留内容：${name}`);
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

// A journal permits interrupted multi-file restores to resume. If an external
// edit is neither the before nor after snapshot, preserve it and report conflict.
export async function applySource(
  workshop: string,
  before: FileMap,
  after: FileMap,
) {
  validateFiles(before);
  validateFiles(after);
  const current = await readSource(workshop, true);
  for (const name of new Set([
    ...Object.keys(current),
    ...Object.keys(before),
    ...Object.keys(after),
  ])) {
    const value = current[name];
    if (value !== before[name] && value !== after[name])
      throw new Error(`源码在保存期间被外部修改，已保留内容：${name}`);
  }
  const root = await sourceDirectory(workshop, true);
  await mkdir(join(root, "public"), { recursive: true });
  for (const [name, content] of Object.entries(after))
    if (current[name] !== content)
      await writeText(workshop, root, name, content, before[name]);
  for (const name of Object.keys(before)) {
    if (Object.hasOwn(after, name) || !Object.hasOwn(current, name)) continue;
    const path = await targetPath(root, name);
    const latest = await currentText(root, name);
    if (latest !== undefined && latest !== before[name])
      throw new Error(`源码在保存期间被外部修改，已保留内容：${name}`);
    await rm(path);
    // Remove only empty source folders; preserve public/, .git and user data.
    for (
      let parent = dirname(path);
      parent !== root;
      parent = dirname(parent)
    ) {
      if (parent === join(root, "public")) break;
      await checkedDirectory(parent);
      try {
        await rmdir(parent);
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          ["ENOTEMPTY", "EEXIST"].includes(String(error.code))
        )
          break;
        throw error;
      }
    }
  }
  const complete = await readSource(workshop);
  if (
    Object.keys(complete).length !== Object.keys(after).length ||
    Object.entries(after).some(([name, content]) => complete[name] !== content)
  )
    throw new Error("源码在保存期间被外部修改，请重新读取。");
}
