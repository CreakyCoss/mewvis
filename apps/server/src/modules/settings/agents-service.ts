import { recordId } from "../../shared/record-id.js";
import type { AgentSettingsRepository } from "./agents-repository.js";
import {
  nonempty,
  object,
  onlyKeys,
  ServiceError,
  type JsonObject,
} from "../../shared/validation.js";
import { array, nullableText } from "./normalization.js";

export class AgentSettingsService {
  constructor(private readonly repository: AgentSettingsRepository) {}

  read() {
    return this.repository.read();
  }

  saveAgent(input: JsonObject) {
    onlyKeys(input, ["id", "name", "avatar", "description"]);
    const now = Date.now();
    return this.repository.saveAgent({
      id: recordId(input.id),
      name: nonempty(input.name, "Agent 名称"),
      avatar: nonempty(input.avatar, "Agent 头像"),
      description: nullableText(input.description, "description"),
      createdAt: now,
      updatedAt: now,
    });
  }

  saveWorkflow(input: JsonObject) {
    onlyKeys(input, [
      "id",
      "name",
      "description",
      "writerAgentId",
      "reviewerAgentId",
      "draftInstruction",
      "reviewInstruction",
      "reviseInstruction",
      "steps",
    ]);
    // Rust still requires these legacy strings in the input, but derives the stored values from steps.
    for (const key of ["writerAgentId", "reviewerAgentId"]) {
      if (typeof input[key] !== "string")
        throw new ServiceError(400, "INVALID_ARGUMENT", `${key} 必须是字符串`);
    }
    const steps = array(input.steps ?? [], "steps").map((value, index) => {
      const step = object(value, "step");
      onlyKeys(step, ["id", "name", "agentId", "instruction", "phase"]);
      return {
        id: recordId(step.id),
        name: nonempty(step.name, `第 ${index + 1} 个协作步骤名称`),
        agentId: nonempty(step.agentId, `第 ${index + 1} 个协作步骤 Agent`),
        instruction: nullableText(step.instruction, "instruction"),
        phase: nullableText(step.phase, "phase"),
      };
    });
    if (!steps.length)
      throw new ServiceError(400, "INVALID_ARGUMENT", "请至少配置一个协作步骤");
    const now = Date.now();
    const writerAgentId = steps[0].agentId;
    const reviewerAgentId = (
      steps.slice(1).find((step) => step.agentId !== writerAgentId) ??
      steps[1] ??
      steps[0]
    ).agentId;
    return this.repository.saveWorkflow({
      id: recordId(input.id),
      name: nonempty(input.name, "协作流程名称"),
      description: nullableText(input.description, "description"),
      writerAgentId,
      reviewerAgentId,
      draftInstruction: nullableText(
        input.draftInstruction,
        "draftInstruction",
      ),
      reviewInstruction: nullableText(
        input.reviewInstruction,
        "reviewInstruction",
      ),
      reviseInstruction: nullableText(
        input.reviseInstruction,
        "reviseInstruction",
      ),
      steps,
      createdAt: now,
      updatedAt: now,
    });
  }

  deleteAgent(id: unknown) {
    return this.repository.deleteAgent(nonempty(id, "Agent ID"));
  }
  deleteWorkflow(id: unknown) {
    return this.repository.deleteWorkflow(nonempty(id, "协作流程 ID"));
  }
}
