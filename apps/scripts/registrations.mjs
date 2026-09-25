import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";

/** Read the explicit source list used by a built-in package build. */
export async function loadRegistrations(configPath, key, sourceRoot) {
  let document;
  try {
    document = JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    throw new Error(`无法读取注册配置 ${configPath}：${error.message}`, {
      cause: error,
    });
  }
  if (
    !document ||
    typeof document !== "object" ||
    Array.isArray(document) ||
    Object.keys(document).length !== 1 ||
    !Array.isArray(document[key])
  )
    throw new Error(`注册配置 ${configPath} 必须只包含 ${key} 数组`);

  const names = document[key];
  const seen = new Set();
  const registrations = [];
  for (const name of names) {
    if (typeof name !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(name))
      throw new Error(`注册配置 ${configPath} 包含无效目录名：${String(name)}`);
    if (seen.has(name))
      throw new Error(`注册配置 ${configPath} 包含重复目录名：${name}`);
    seen.add(name);
    const path = join(sourceRoot, name);
    let entry;
    try {
      entry = await lstat(path);
    } catch (error) {
      if (error.code === "ENOENT")
        throw new Error(`注册的目录不存在：${path}`, { cause: error });
      throw error;
    }
    if (!entry.isDirectory() || entry.isSymbolicLink())
      throw new Error(`注册项必须是普通目录：${path}`);
    registrations.push({ name, sourceRoot: path });
  }
  return registrations;
}
