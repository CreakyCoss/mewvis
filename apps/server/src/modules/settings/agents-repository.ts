import type { ConfigDatabase } from "../../storage/config/database.js";
import type { AgentDefinition } from "./types.js";

export class AgentSettingsRepository {
  constructor(private readonly database: ConfigDatabase) {}

  read(): { agents: AgentDefinition[] } {
    const rows = this.database.connection
      .prepare(
        "SELECT id, definition_json, created_at, updated_at FROM agent_definitions ORDER BY created_at ASC, rowid ASC",
      )
      .all();
    return {
      agents: rows.map((row) => {
        const definition = JSON.parse(String(row.definition_json));
        return {
          ...definition,
          id: String(row.id),
          templateId: definition.templateId ?? null,
          createdAt: Number(row.created_at),
          updatedAt: Number(row.updated_at),
        };
      }),
    };
  }

  saveAgent(agent: AgentDefinition) {
    return this.database.transaction(() => {
      this.writeAgent(agent);
      return this.read();
    });
  }

  addTemplateAgent(agent: AgentDefinition) {
    return this.database.transaction(() => {
      const settings = this.read();
      if (settings.agents.some((item) => item.templateId === agent.templateId))
        return settings;
      this.writeAgent(agent);
      return this.read();
    });
  }

  private writeAgent(agent: AgentDefinition) {
    const { id, createdAt, updatedAt, ...definition } = agent;
    this.database.connection
      .prepare(
        `INSERT INTO agent_definitions (id, definition_json, created_at, updated_at)
       VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET definition_json=excluded.definition_json, updated_at=excluded.updated_at`,
      )
      .run(id, JSON.stringify(definition), createdAt, updatedAt);
  }

  deleteAgent(id: string) {
    return this.database.transaction(() => {
      this.database.connection
        .prepare("DELETE FROM agent_definitions WHERE id=?")
        .run(id);
      return this.read();
    });
  }
}
