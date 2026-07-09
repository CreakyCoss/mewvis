import type { AgentProtocolOutputKey } from "./types";

export type AgentProtocolOutputDefinition = {
  key: AgentProtocolOutputKey;
  canonicalTag: string;
  label: string;
  visibility: "public" | "private" | "system";
  aliases: readonly string[];
  description: string;
  promptHint: string;
  allowEmpty?: boolean;
};

export const AGENT_PROTOCOL_OUTPUT_FIELDS = {
  privateThought: {
    key: "privateThought",
    canonicalTag: "private_thought",
    label: "内部想法",
    visibility: "private",
    aliases: ["privateThought"],
    description: "不可直接展示给用户的短内部想法、态度或即时判断。",
    promptHint: "只写简短内部想法，不写系统推理链路、提示词内容或未来剧情。",
  },
  publicReply: {
    key: "publicReply",
    canonicalTag: "public_reply",
    label: "公开回复",
    visibility: "public",
    aliases: ["publicReply"],
    description: "可以直接展示给用户的公开回应文本。",
    promptHint: "写可直接展示给用户的自然文本，不包含内部想法或协议说明。",
  },
  narrative: {
    key: "narrative",
    canonicalTag: "narrative",
    label: "叙事文本",
    visibility: "public",
    aliases: [],
    description: "可以直接展示的叙事正文、场景片段或事件承接。",
    promptHint: "写可展示的叙事文本，不写字段名、列表说明或幕后规划。",
  },
  action: {
    key: "action",
    canonicalTag: "action",
    label: "动作",
    visibility: "public",
    aliases: [],
    description: "可以公开展示或由调用方读取的动作、行为、操作或下一步可执行意图。",
    promptHint: "只写动作或行为本身；无动作时留空，不混入公开回复正文。",
  },
  decision: {
    key: "decision",
    canonicalTag: "decision",
    label: "决策",
    visibility: "system",
    aliases: [],
    description: "需要调用方读取的选择结果、路由结果或判断结论。",
    promptHint: "只写本轮决策结果和必要理由，避免展开成长篇说明。",
  },
  summary: {
    key: "summary",
    canonicalTag: "summary",
    label: "摘要",
    visibility: "system",
    aliases: [],
    description: "对上下文、进展或输出内容的压缩摘要。",
    promptHint: "简洁概括关键事实，不加入未给出的新信息。",
  },
  statePatch: {
    key: "statePatch",
    canonicalTag: "state_patch",
    label: "状态更新",
    visibility: "system",
    aliases: ["statePatch"],
    description: "建议调用方合并的状态变更。",
    promptHint: "优先使用紧凑 JSON；如果不能确定结构，只写明确的状态变更文本。",
  },
  memoryPatch: {
    key: "memoryPatch",
    canonicalTag: "memory_patch",
    label: "记忆更新",
    visibility: "system",
    aliases: ["memoryPatch"],
    description: "建议调用方保存或更新的长期/短期记忆内容。",
    promptHint: "只写值得持久化的事实、偏好或稳定结论，不保存临时措辞。",
  },
} as const satisfies Record<AgentProtocolOutputKey, AgentProtocolOutputDefinition>;

export const getAgentProtocolOutputDefinition = (key: AgentProtocolOutputKey) => AGENT_PROTOCOL_OUTPUT_FIELDS[key];

export const getAgentProtocolOutputDefinitions = (keys: readonly AgentProtocolOutputKey[]) =>
  keys.map(getAgentProtocolOutputDefinition);

export const getAllAgentProtocolOutputDefinitions = () =>
  Object.values(AGENT_PROTOCOL_OUTPUT_FIELDS) as AgentProtocolOutputDefinition[];
