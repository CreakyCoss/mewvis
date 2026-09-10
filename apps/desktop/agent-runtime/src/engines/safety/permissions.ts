import type { AgentPermissions } from "../protocol/wire.js";
import type { SafetyRisk } from "./types.js";

type PermissionDefinition = Readonly<{
  mode: AgentPermissions["mode"];
  label: string;
  description: string;
  isDefault: boolean;
  policy: Readonly<{
    maximumRisk: SafetyRisk;
    allowUnknown: boolean;
    allowProtected: boolean;
    allowUnsandboxed: boolean;
  }>;
}>;

/** Single source for execution policy, capability discovery and generated protocol modes. */
export const AGENT_PERMISSION_DEFINITIONS = [
  {
    mode: "ask",
    label: "请求批准",
    description: "低风险操作直接执行；其他操作由你确认",
    isDefault: true,
    policy: { maximumRisk: "low", allowUnknown: false, allowProtected: false, allowUnsandboxed: false },
  },
  {
    mode: "auto",
    label: "帮我批准",
    description: "按规则自动放行低、中风险操作；高风险或未知风险由你确认",
    isDefault: false,
    policy: { maximumRisk: "medium", allowUnknown: false, allowProtected: false, allowUnsandboxed: false },
  },
  {
    mode: "full",
    label: "完全访问权限",
    description: "自动允许操作，无需逐次确认；允许访问工作区外文件和网络",
    isDefault: false,
    policy: { maximumRisk: "high", allowUnknown: true, allowProtected: true, allowUnsandboxed: true },
  },
] as const satisfies readonly PermissionDefinition[];

export const DEFAULT_AGENT_PERMISSION_MODE = AGENT_PERMISSION_DEFINITIONS.find(
  (definition) => definition.isDefault,
)!.mode;

export const getAgentPermissionOptions = () =>
  AGENT_PERMISSION_DEFINITIONS.map(({ mode, label, description, isDefault }) => ({
    mode,
    label,
    description,
    isDefault,
  }));

export function getAgentPermissionPolicy(mode: AgentPermissions["mode"]) {
  const definition = AGENT_PERMISSION_DEFINITIONS.find((definition) => definition.mode === mode);
  if (!definition) throw new Error("无效的权限模式，操作未执行。");
  return definition.policy;
}
