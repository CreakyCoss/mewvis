import { recordId } from "../../shared/record-id.js";
import type { AgentSettingsRepository } from "./agents-repository.js";
import {
  nonempty,
  onlyKeys,
  type JsonObject,
} from "../../shared/validation.js";
import { nullableText } from "./normalization.js";

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

  deleteAgent(id: unknown) {
    return this.repository.deleteAgent(nonempty(id, "Agent ID"));
  }
}
