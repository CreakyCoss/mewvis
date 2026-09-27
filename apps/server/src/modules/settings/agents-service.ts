import { agentTemplates } from "./agent-templates.js";
import { recordId } from "../../shared/record-id.js";
import type { AgentSettingsRepository } from "./agents-repository.js";
import {
  nonempty,
  onlyKeys,
  invalid,
  ServiceError,
  type JsonObject,
} from "../../shared/validation.js";

const stringList = (value: unknown, label: string): string[] => {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || !item.trim())
  )
    invalid(`${label} 必须是非空字符串列表`);
  return [...new Set((value as string[]).map((item) => item.trim()))];
};

export class AgentSettingsService {
  constructor(private readonly repository: AgentSettingsRepository) {}
  read() {
    return this.repository.read();
  }

  templates() {
    return { templates: structuredClone(agentTemplates) };
  }

  private template(value: unknown) {
    const templateId = nonempty(value, "智能体配置 ID");
    const template = agentTemplates.find((item) => item.id === templateId);
    if (!template) invalid("系统智能体配置不存在");
    const {
      id: _id,
      references: _references,
      ...configuration
    } = structuredClone(template);
    return { ...configuration, templateId };
  }

  addTemplate(value: unknown) {
    const now = Date.now();
    return this.repository.addTemplateAgent({
      ...this.template(value),
      id: recordId(undefined),
      createdAt: now,
      updatedAt: now,
    });
  }

  resetAgent(value: unknown) {
    const id = nonempty(value, "智能体 ID");
    const agent = this.repository.read().agents.find((item) => item.id === id);
    if (!agent) throw new ServiceError(404, "AGENT_NOT_FOUND", "智能体已删除");
    if (!agent.templateId) invalid("自行创建的智能体没有可重置的系统配置");
    return this.repository.saveAgent({
      ...this.template(agent.templateId),
      id,
      createdAt: agent.createdAt,
      updatedAt: Date.now(),
    });
  }

  saveAgent(input: JsonObject) {
    onlyKeys(input, [
      "id",
      "name",
      "avatar",
      "summary",
      "category",
      "instructions",
      "useCases",
      "starterPrompts",
      "skillKeys",
      "toolNames",
      "knowledgeCollectionIds",
    ]);
    if (input.summary !== undefined && typeof input.summary !== "string")
      invalid("智能体介绍必须是字符串");
    const now = Date.now();
    const id = recordId(input.id);
    const existing = this.repository
      .read()
      .agents.find((item) => item.id === id);
    return this.repository.saveAgent({
      id,
      name: nonempty(input.name, "智能体名称"),
      avatar: nonempty(input.avatar, "智能体头像"),
      summary: typeof input.summary === "string" ? input.summary.trim() : "",
      category: nonempty(input.category, "智能体分类"),
      instructions: nonempty(input.instructions, "工作指令"),
      useCases: stringList(input.useCases, "适用场景"),
      starterPrompts: stringList(input.starterPrompts, "示例任务"),
      skillKeys: stringList(input.skillKeys, "技能"),
      toolNames: stringList(input.toolNames, "工具"),
      knowledgeCollectionIds: stringList(
        input.knowledgeCollectionIds,
        "知识库",
      ),
      templateId: existing?.templateId ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  deleteAgent(value: unknown) {
    const id = nonempty(value, "智能体 ID");
    return this.repository.deleteAgent(id);
  }
}
