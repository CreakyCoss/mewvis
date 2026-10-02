import { Ajv } from "ajv";
import { homedir, tmpdir } from "node:os";
import schema from "../../../protocol/v1/schema/access.schema.json" with { type: "json" };
import type { AgentAccess, AgentAccessBase, AgentAccessPaths } from "@mewvis/chat-contracts";
import { canonicalPath, containsPath, getPathPlatform, networkAllowed } from "../platforms/resources.js";
import type { OperationAnalysis } from "../safety/types.js";

const validator = new Ajv({ allErrors: true }).compile<AgentAccess>({
  ...schema,
  anyOf: undefined,
  $ref: "#/definitions/AgentAccess",
});

export type AccessPaths = readonly string[] | "all";
export type ResolvedAgentAccess = Readonly<{
  filesystem: Readonly<{ read: AccessPaths; write: AccessPaths }>;
  network: Readonly<{ hosts: readonly string[] | "all" }>;
  process: Readonly<{ execute: boolean }>;
}>;

/** The protocol owns the shape; path bases come from the selected workspace and runtime environment. */
export function resolveAgentAccess(
  declaration: unknown,
  context: { workspacePath: string },
): ResolvedAgentAccess {
  if (!validator(declaration)) throw new Error(`agentAccess 不符合权限协议：${JSON.stringify(validator.errors)}`);
  const bases: Record<AgentAccessBase, string> = {
    workspace: context.workspacePath,
    home: homedir(),
    temp: tmpdir(),
  };
  const platform = getPathPlatform();
  const paths = (scope: AgentAccessPaths | undefined): AccessPaths => {
    if (scope === "all") return "all";
    return Object.freeze([
      ...new Set(
        (scope ?? []).map((entry) => {
          const base = bases[entry.base];
          if (!base || !platform.isAbsolutePath(base)) throw new Error(`宿主未提供有效的权限路径：${entry.base}`);
          const root = canonicalPath(base);
          const target = canonicalPath(platform.path.resolve(root, entry.path ?? "."));
          if (!containsPath(root, target)) throw new Error(`权限路径超出 ${entry.base}：${entry.path}`);
          return target;
        }),
      ),
    ]);
  };
  const hosts = declaration.network?.hosts ?? [];
  return Object.freeze({
    filesystem: Object.freeze({
      read: paths(declaration.filesystem?.read),
      write: paths(declaration.filesystem?.write),
    }),
    network: Object.freeze({
      hosts: hosts === "all" ? hosts : Object.freeze([...new Set(hosts.map((host) => host.toLowerCase()))]),
    }),
    process: Object.freeze({ execute: declaration.process?.execute ?? false }),
  });
}

export function accessAllowsPath(paths: AccessPaths, target: string): boolean {
  return paths === "all" || paths.some((root) => containsPath(root, canonicalPath(target)));
}

/** Intersections retain the narrower path; empty lists never mean unrestricted. */
export function intersectAccessPaths(left: AccessPaths, right: AccessPaths): string[] | "all" {
  if (left === "all") return right === "all" ? "all" : [...right];
  if (right === "all") return [...left];
  return [
    ...new Set(left.flatMap((a) => right.flatMap((b) => (containsPath(a, b) ? [b] : containsPath(b, a) ? [a] : [])))),
  ];
}

export function intersectAccessHosts(
  left: readonly string[] | "all",
  right: readonly string[] | "all",
): string[] | "all" {
  if (left === "all") return right === "all" ? "all" : [...right];
  if (right === "all") return [...left];
  const contains = (a: string, b: string) => a === b || (a.startsWith("*.") && b.endsWith(a.slice(1)));
  return [
    ...new Set(
      left.flatMap((a) =>
        right.flatMap((b) =>
          contains(a.toLowerCase(), b.toLowerCase()) ? [b] : contains(b.toLowerCase(), a.toLowerCase()) ? [a] : [],
        ),
      ),
    ),
  ];
}

/** Hard denials run before the optional approval policy. Opaque code is confined by execution. */
export function checkAgentAccess(access: ResolvedAgentAccess, analysis: OperationAnalysis): string | undefined {
  for (const operation of analysis.operations) {
    if (operation.kind === "filesystem") {
      const action = ["write", "delete"].includes(operation.action) ? "write" : "read";
      if (!accessAllowsPath(access.filesystem[action], operation.target))
        return `未申请文件${action === "write" ? "写入" : "读取"}权限：${operation.target}`;
    } else if (operation.kind === "process" && !access.process.execute) {
      return "未申请执行命令、脚本和外部程序的权限。";
    } else if (operation.kind === "network") {
      const host = new URL(operation.url).hostname;
      if (
        !networkAllowed(
          { network: { allow: access.network.hosts === "all" ? "all" : [...access.network.hosts], deny: [] } },
          host,
        )
      )
        return `未申请网络访问权限：${host}`;
    }
  }
}
