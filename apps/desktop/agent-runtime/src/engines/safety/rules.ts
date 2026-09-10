import { statSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { canonicalPath, containsPath } from "./paths.js";
import type { SafetyRule } from "./types.js";

/** Rules describe effects and risks; permission modes and request sources do not belong here. */
export const SAFETY_RULES: readonly SafetyRule[] = [
  {
    id: "filesystem.access",
    description: "按文件操作及工作区范围评估风险。",
    evaluate(operation, { workspacePath }) {
      if (operation.kind !== "filesystem") return;
      const outside = !containsPath(canonicalPath(workspacePath), operation.target);
      const mutation = operation.action === "write" || operation.action === "delete";
      return {
        risk: operation.action === "delete" || (outside && mutation) ? "high" : outside || mutation ? "medium" : "low",
        reason: `${operation.action}${outside ? "（工作区外）" : ""}：${operation.target}`,
      };
    },
  },
  {
    id: "filesystem.credentials",
    description: "识别凭据目录及可能遍历到这些目录的操作。",
    evaluate(operation) {
      if (operation.kind !== "filesystem") return;
      const protectedTarget = [".ssh", ".aws", ".gnupg"].some((name) => {
        const root = canonicalPath(resolve(homedir(), name));
        return containsPath(root, operation.target) || (operation.recursive && containsPath(operation.target, root));
      });
      if (protectedTarget) return { risk: "high", constraint: "protected", reason: "操作涉及凭据目录。" };
    },
  },
  {
    id: "filesystem.runtime-config",
    description: "识别对版本控制数据和运行配置的修改。",
    evaluate(operation, { workspacePath }) {
      if (operation.kind !== "filesystem" || !["write", "delete"].includes(operation.action)) return;
      if (
        [".pi", ".git", ".isle", ".env"].some((name) => {
          const root = canonicalPath(resolve(workspacePath, name));
          return containsPath(root, operation.target) || (operation.recursive && containsPath(operation.target, root));
        })
      )
        return { risk: "high", reason: "操作将修改运行配置或版本控制数据。" };
    },
  },
  {
    id: "filesystem.hardlink-write",
    description: "识别可能同时修改其他路径内容的硬链接写入。",
    evaluate(operation) {
      if (operation.kind !== "filesystem" || operation.action !== "write") return;
      try {
        if (statSync(operation.target).nlink > 1)
          return { risk: "high", constraint: "protected", reason: "目标文件具有多个硬链接。" };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    },
  },
  {
    id: "process.execute",
    description: "通用命令可运行脚本或间接产生副作用，不能仅凭命令名判为安全。",
    evaluate(operation) {
      if (operation.kind !== "process") return;
      return { risk: "high", reason: `执行命令：${operation.command}` };
    },
  },
  {
    id: "process.unsandboxed",
    description: "识别未受沙箱隔离的进程执行。",
    evaluate(operation) {
      if (operation.kind === "process" && !operation.sandboxed)
        return { risk: "high", constraint: "unsandboxed", reason: "命令未受沙箱隔离，可访问宿主文件及网络。" };
    },
  },
  {
    id: "network.request",
    description: "外部请求可能发送数据或修改远端状态。",
    evaluate(operation) {
      if (operation.kind === "network") return { risk: "high", reason: `${operation.method} ${operation.url}` };
    },
  },
  {
    id: "interaction.request",
    description: "提问和委派本身不授予后续操作权限，子 Agent 的执行仍须逐次检查。",
    evaluate(operation) {
      if (operation.kind === "interaction")
        return { risk: "low", reason: operation.action === "ask" ? "询问用户。" : "委派子 Agent。" };
    },
  },
];
