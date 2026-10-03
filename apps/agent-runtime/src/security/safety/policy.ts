import { APP_DATA_DIR_NAME } from "@mewvis/product-config";
import { statSync } from "node:fs";
import {
  containsPath,
  networkAllowed,
  resourcePaths,
  resourceDomains,
  validateConfiguredPaths,
} from "../platforms/resources.js";
import type { SafetyConfig, SafetyRisk } from "./types.js";

// All approval settings, operation risks and rule implementations live here.
// This is trusted host configuration; adapters only supply facts about the call.
const baseline = {
  denyRead: ["${home}/.ssh", "${home}/.aws", "${home}/.gnupg"],
  denyWrite: [
    "${home}/.ssh",
    "${home}/.aws",
    "${home}/.gnupg",
    "${runtime}",
    "${workspace}/.git/hooks",
    "${workspace}/.git/config",
  ],
  deniedDomains: [] as string[],
  denyHardlinkWrites: true,
};
const restricted = {
  filesystem: {
    allowWrite: ["${workspace}", "${temp}"],
    denyRead: [] as string[],
    denyWrite: [
      "${workspace}/.env",
      "${workspace}/.pi",
      "${workspace}/.git",
      `\${workspace}/${APP_DATA_DIR_NAME}`,
    ],
  },
  network: { allow: [] as string[], deny: [] as string[] },
};
const profiles = [
  {
    mode: "ask",
    label: "请求批准",
    isDefault: false,
    approval: { maximumRisk: "low", unknown: "ask" },
    ...restricted,
  },
  {
    mode: "auto",
    label: "帮我批准",
    isDefault: true,
    approval: { maximumRisk: "medium", unknown: "ask" },
    ...restricted,
    network: { allow: "all", deny: [] },
  },
  {
    mode: "full",
    label: "完全访问权限",
    isDefault: false,
    approval: { maximumRisk: "high", unknown: "allow" },
    filesystem: {
      allowWrite: ["${workspace}", "${home}", "${temp}"],
      denyRead: [],
      denyWrite: [],
    },
    network: { allow: "all", deny: [] },
  },
] as const;
const risks = {
  filesystem: {
    workspaceRead: "low",
    workspaceWrite: "medium",
    externalRead: "medium",
    externalWrite: "high",
    delete: "high",
  },
  process: "high",
  network: "medium",
  interaction: "low",
} satisfies Record<string, SafetyRisk | Record<string, SafetyRisk>>;

export const SAFETY_CONFIG: SafetyConfig = {
  enabled: true,
  profiles: profiles.map((profile) => {
    const risk = { low: "低", medium: "低、中", high: "低、中、高" }[
      profile.approval.maximumRisk
    ];
    const unknown = { allow: "自动放行", ask: "需要审批", deny: "禁止执行" }[
      profile.approval.unknown
    ];
    const roots =
      profile.filesystem.allowWrite
        .map((path) =>
          path === "/"
            ? "全部路径"
            : path
                .replace("${workspace}", "工作区")
                .replace("${home}", "用户目录")
                .replace("${temp}", "临时目录"),
        )
        .join("、") || "无";
    const network =
      profile.network.allow === "all"
        ? "任意域名"
        : profile.network.allow.join("、") || "禁止联网";
    return {
      mode: profile.mode,
      label: profile.label,
      isDefault: profile.isDefault,
      approval: profile.approval,
      description: `${risk}风险直接执行，超过上限需审批；未知操作${unknown}。调用前检查可写范围：${roots}；可访问域名：${network}。沙箱由执行配置独立控制。`,
    };
  }),
  rules({ mode, workspacePath, resolvePath }) {
    const profile = profiles.find((profile) => profile.mode === mode);
    if (!profile) throw new Error("无效的权限模式。");
    const paths = (values: readonly string[]) => {
      const parsed = resourcePaths.parse(values);
      validateConfiguredPaths(parsed);
      return parsed.map(resolvePath);
    };
    // Snapshot only data. Rules close over these private values, never mutable session state.
    const filesystem = {
      allowWrite: paths(profile.filesystem.allowWrite),
      denyRead: paths([...baseline.denyRead, ...profile.filesystem.denyRead]),
      denyWrite: paths([
        ...baseline.denyWrite,
        ...profile.filesystem.denyWrite,
      ]),
    };
    const network = {
      allow:
        profile.network.allow === "all"
          ? ("all" as const)
          : resourceDomains.parse(profile.network.allow),
      deny: resourceDomains.parse([
        ...baseline.deniedDomains,
        ...profile.network.deny,
      ]),
    };
    const risk = structuredClone(risks);
    const denyHardlinkWrites = baseline.denyHardlinkWrites;
    return [
      {
        id: "filesystem.access",
        description: "检查文件范围并按操作和位置分配风险。",
        scope: "operation",
        evaluate({ operation }) {
          if (operation?.kind !== "filesystem") return;
          const { target, action, recursive } = operation;
          const mutation = action === "write" || action === "delete";
          const blocked = (roots: string[]) =>
            roots.find(
              (root) =>
                containsPath(root, target) ||
                (recursive && containsPath(target, root)),
            );
          const deniedRoot = blocked(
            mutation ? filesystem.denyWrite : filesystem.denyRead,
          );
          const denied = deniedRoot
            ? `公共或档位规则禁止${mutation ? "写入" : "访问"}：${deniedRoot}`
            : mutation &&
                !filesystem.allowWrite.some((root) =>
                  containsPath(root, target),
                )
              ? `目标不在允许写入的范围：${target}`
              : undefined;
          const outside = !containsPath(workspacePath, target);
          return {
            risk:
              action === "delete"
                ? risk.filesystem.delete
                : outside
                  ? mutation
                    ? risk.filesystem.externalWrite
                    : risk.filesystem.externalRead
                  : mutation
                    ? risk.filesystem.workspaceWrite
                    : risk.filesystem.workspaceRead,
            reason: denied ?? `${action}：${target}`,
            ...(denied ? { effect: "deny" as const } : {}),
          };
        },
      },
      {
        id: "filesystem.hardlink-write",
        description: "阻止文件工具写入多硬链接目标。",
        scope: "operation",
        evaluate({ operation }) {
          if (
            !denyHardlinkWrites ||
            operation?.kind !== "filesystem" ||
            operation.action !== "write"
          )
            return;
          try {
            if (statSync(operation.target).nlink > 1)
              return {
                risk: "high",
                effect: "deny",
                reason: "文件工具禁止写入多硬链接目标。",
              };
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          }
        },
      },
      {
        id: "process.execute",
        description: "命令按配置风险处理。",
        scope: "operation",
        evaluate({ operation }) {
          if (operation?.kind === "process")
            return {
              risk: risk.process,
              reason: `执行命令：${operation.command}`,
            };
        },
      },
      {
        id: "network.request",
        description: "检查网络范围并分配请求风险。",
        scope: "operation",
        evaluate({ operation }) {
          if (operation?.kind !== "network") return;
          if (!networkAllowed({ network }, new URL(operation.url).hostname))
            return {
              risk: risk.network,
              effect: "deny",
              reason: "目标不在配置允许的网络范围。",
            };
          return {
            risk: risk.network,
            reason: `${operation.method} ${operation.url}`,
          };
        },
      },
      {
        id: "tool.declared-risk",
        description: "已启用工具按定义声明的风险等级处理。",
        scope: "operation",
        evaluate({ operation }) {
          if (operation?.kind === "tool")
            return {
              risk: operation.risk,
              reason: `工具声明风险：${operation.risk}`,
            };
        },
      },
      {
        id: "interaction.request",
        description: "提问和委派不改变后续工具执行权限。",
        scope: "operation",
        evaluate({ operation }) {
          if (operation?.kind === "interaction")
            return {
              risk: risk.interaction,
              reason:
                operation.action === "ask" ? "询问用户。" : "委派子 Agent。",
            };
        },
      },
      // Add invocation rules here too. They inspect request.entry/input directly;
      // use effect: "ask" or "deny" to override the profile's risk threshold.
    ];
  },
};
