import { lstatSync, readlinkSync, realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { z } from "zod";
import * as posix from "./posix/paths.js";
import * as windows from "./windows/paths.js";

/** Shared platform selection without importing sandbox backends. */
export function platformKey(platform: NodeJS.Platform): "posix" | "windows" {
  switch (platform) {
    case "win32":
      return "windows";
    case "darwin":
    case "linux":
      return "posix";
    default:
      throw new Error(`当前安全模块不支持 ${platform}。`);
  }
}

export function getPathPlatform(platform: NodeJS.Platform = process.platform) {
  return { posix, windows }[platformKey(platform)];
}

/** Bundled configuration can contain paths for either supported platform. */
export function isConfiguredAbsolutePath(value: string) {
  return posix.isAbsolutePath(value) || windows.isAbsolutePath(value);
}

export function containsPath(root: string, target: string, platform: NodeJS.Platform = process.platform) {
  const { path } = getPathPlatform(platform);
  const relative = path.relative(root, target);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

const { dirname, relative, resolve } = getPathPlatform().path;

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

export function networkAllowed(policy: { network: { allow: string[] | "all"; deny: string[] } }, host: string) {
  const matches = (pattern: string) =>
    pattern.startsWith("*.")
      ? host.toLowerCase().endsWith(pattern.slice(1).toLowerCase())
      : host.toLowerCase() === pattern.toLowerCase();
  return !policy.network.deny.some(matches) && (policy.network.allow === "all" || policy.network.allow.some(matches));
}

export const resourcePaths = z.array(
  z
    .string()
    .min(1)
    .refine((path) => !/[*?\[\]]/.test(path), "路径只支持目录或文件，不支持 glob。"),
);
export const resourceDomains = z.array(
  z.string().regex(/^(?:\*\.)?[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/, "域名只支持精确名称或 *.example.com。"),
);

export function validateConfiguredPaths(
  paths: string[],
  variables: readonly string[] = ["workspace", "home", "temp", "runtime"],
) {
  for (const path of paths) {
    const expanded = path.replace(/\$\{([^}]+)\}/g, (token, name: string) =>
      variables.includes(name) ? "/resolved" : token,
    );
    if (expanded.includes("${") || !isConfiguredAbsolutePath(expanded))
      throw new Error(`未知路径变量或非绝对路径：${path}`);
  }
}

export function createResourcePathResolver(workspacePath: string, runtimePath: string) {
  const platform = getPathPlatform();
  const variables: Record<string, string> = {
    workspace: workspacePath,
    home: homedir(),
    temp: tmpdir(),
    runtime: runtimePath,
    nodeDirectory: dirname(process.execPath),
    arch: process.arch,
    ...platform.resourceVariables(),
  };
  return (value: string) => {
    const expanded = value.replace(/\$\{([^}]+)\}/g, (_, name: string) => {
      if (!(name in variables)) throw new Error(`未知的路径变量：${name}`);
      return variables[name];
    });
    if (!platform.isAbsolutePath(expanded)) throw new Error(`资源路径必须是完整绝对路径或受支持的变量：${value}`);
    return platform.preserveResourcePath(expanded) ? expanded : canonicalPath(expanded);
  };
}
