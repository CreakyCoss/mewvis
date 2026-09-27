import { recordId } from "../../shared/record-id.js";
import type { AgentSettingsRepository } from "./agents-repository.js";
import {
  nonempty,
  onlyKeys,
  invalid,
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
    if (typeof input.id === "string" && input.id.startsWith("builtin:"))
      invalid("内置智能体不能直接修改，请复制后编辑");
    if (input.summary !== undefined && typeof input.summary !== "string")
      invalid("智能体介绍必须是字符串");
    const now = Date.now();
    return this.repository.saveAgent({
      id: recordId(input.id),
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
      source: "custom",
      createdAt: now,
      updatedAt: now,
    });
  }

  deleteAgent(value: unknown) {
    const id = nonempty(value, "智能体 ID");
    if (id.startsWith("builtin:")) invalid("内置智能体不能删除");
    return this.repository.deleteAgent(id);
  }
}
