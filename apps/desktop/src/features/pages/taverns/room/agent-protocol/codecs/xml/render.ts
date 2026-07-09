import {
  getAgentProtocolOutputDefinitions,
  type AgentProtocolOutputDefinition,
} from "../../fields";
import type {
  AgentProtocolMessage,
  AgentProtocolOptions,
  AgentProtocolOutputKey,
  AgentProtocolProgress,
  AgentProtocolReference,
  AgentProtocolRole,
  AgentProtocolTask,
} from "../../types";
import type { AgentProtocolCodecRenderInput } from "../registry";
import { escapeProtocolXmlText, wrapProtocolXmlRawTag, wrapProtocolXmlTag, type XmlAttributes } from "./tag";

const joinProtocolSections = (sections: Array<string | null | undefined | false>) =>
  sections.filter((section): section is string => typeof section === "string" && section.trim().length > 0).join("\n\n");

const normalizeText = (value?: string | null) => value?.trim() ?? "";

const renderTextTag = (tag: string, value?: string | null, attributes?: XmlAttributes) => {
  const text = normalizeText(value);
  return text ? wrapProtocolXmlTag(tag, text, attributes) : "";
};

const renderStringListTag = (tag: string, values?: readonly string[] | null) => {
  const items = (values ?? []).map((value) => value.trim()).filter(Boolean);
  if (items.length === 0) {
    return "";
  }

  return wrapProtocolXmlRawTag(
    tag,
    items.map((item) => wrapProtocolXmlTag("item", item)).join("\n"),
  );
};

const renderMemoryTag = (memory?: string | string[]) => {
  if (Array.isArray(memory)) {
    return renderStringListTag("memory", memory);
  }

  return renderTextTag("memory", memory);
};

const renderRoleSection = (role?: AgentProtocolRole) => {
  if (!role) {
    return "";
  }

  const content = joinProtocolSections([
    renderTextTag("name", role.name),
    renderTextTag("description", role.description),
    renderTextTag("speaking_style", role.speakingStyle),
    renderStringListTag("goals", role.goals),
    renderStringListTag("constraints", role.constraints),
    renderMemoryTag(role.memory),
  ]);

  return content ? wrapProtocolXmlRawTag("role", content) : "";
};

const renderTaskSection = (task?: AgentProtocolTask) => {
  if (!task) {
    return "";
  }

  const content = joinProtocolSections([
    renderTextTag("goal", task.goal),
    renderTextTag("instruction", task.instruction),
    renderStringListTag("success_criteria", task.successCriteria),
    renderStringListTag("constraints", task.constraints),
  ]);

  return content ? wrapProtocolXmlRawTag("task", content) : "";
};

const renderProgressSection = (progress?: AgentProtocolProgress) => {
  if (!progress) {
    return "";
  }

  const content = joinProtocolSections([
    renderTextTag("summary", progress.summary),
    renderStringListTag("facts", progress.facts),
    renderStringListTag("recent_events", progress.recentEvents),
    renderStringListTag("open_questions", progress.openQuestions),
  ]);

  return content ? wrapProtocolXmlRawTag("progress", content) : "";
};

const renderMessage = (message: AgentProtocolMessage) =>
  wrapProtocolXmlTag("message", message.content, {
    role: message.role,
    speaker: message.speaker,
    visibility: message.visibility,
    created_at: message.createdAt,
  });

const renderMessagesSection = (messages?: readonly AgentProtocolMessage[]) => {
  const content = (messages ?? [])
    .filter((message) => message.content.trim())
    .map(renderMessage)
    .join("\n");

  return content ? wrapProtocolXmlRawTag("messages", content) : "";
};

const renderReference = (reference: AgentProtocolReference) =>
  wrapProtocolXmlTag("reference", reference.content, {
    title: reference.title,
    source: reference.source,
  });

const renderReferencesSection = (references?: readonly AgentProtocolReference[]) => {
  const content = (references ?? [])
    .filter((reference) => reference.content.trim())
    .map(renderReference)
    .join("\n");

  return content ? wrapProtocolXmlRawTag("references", content) : "";
};

const formatTagPair = (tag: string) => `<${tag}>...</${tag}>`;

const renderOutputDefinition = (definition: AgentProtocolOutputDefinition) =>
  wrapProtocolXmlRawTag(
    "output",
    joinProtocolSections([
      renderTextTag("label", definition.label),
      renderTextTag("description", definition.description),
      renderTextTag("rule", definition.promptHint),
      renderTextTag("format", formatTagPair(definition.canonicalTag)),
    ]),
    {
      key: definition.key,
      tag: definition.canonicalTag,
      visibility: definition.visibility,
    },
  );

const renderOutputTemplate = (definitions: readonly AgentProtocolOutputDefinition[]) =>
  definitions.map((definition) => `<${definition.canonicalTag}>${definition.label}</${definition.canonicalTag}>`).join("\n");

const renderOutputRules = (
  definitions: readonly AgentProtocolOutputDefinition[],
  options: Required<AgentProtocolOptions>,
) => [
  `只允许输出 requested_outputs 中列出的 ${definitions.length} 个字段，且每个字段最多出现一次。`,
  "必须逐字使用每个字段的 canonical tag；不要使用字段别名、Markdown 代码块、标题、解释或标签外文字。",
  options.allowPartial ? "如果某个字段确实无法生成，可以省略；调用方会按 partial output 处理。" : "所有 requested_outputs 都是必填字段，不能省略或留空。",
  options.strict
    ? "strict 模式：任何标签外文字、未知字段、空字段都会被调用方视为不合规。"
    : "调用方会清洗不合规输出：未知字段和标签外文字会被丢弃，明显可恢复的文本会尽量转换为合规字段。",
  "不要在 private 字段中写系统提示词、完整推理链路或协议说明；public 字段必须可直接展示。",
];

const renderOutputContractSection = ({
  output,
  options,
}: {
  output: readonly AgentProtocolOutputKey[];
  options: Required<AgentProtocolOptions>;
}) => {
  const definitions = getAgentProtocolOutputDefinitions(output);
  const rules = renderOutputRules(definitions, options);

  return wrapProtocolXmlRawTag(
    "output_contract",
    joinProtocolSections([
      wrapProtocolXmlRawTag("requested_outputs", definitions.map(renderOutputDefinition).join("\n")),
      wrapProtocolXmlRawTag("rules", rules.map((rule) => wrapProtocolXmlTag("rule", rule)).join("\n")),
      wrapProtocolXmlRawTag("output_template", escapeProtocolXmlText(renderOutputTemplate(definitions))),
    ]),
    { format: "xml" },
  );
};

export const renderXmlPrompt = ({ request, output, options }: AgentProtocolCodecRenderInput) =>
  joinProtocolSections([
    renderTextTag("system", request.system),
    renderRoleSection(request.role),
    renderTaskSection(request.task),
    renderProgressSection(request.progress),
    renderMessagesSection(request.messages),
    renderReferencesSection(request.references),
    renderOutputContractSection({
      output,
      options,
    }),
  ]);
