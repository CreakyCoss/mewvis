import type { ConfigDatabase } from "../../storage/config/database.js";
import type { AgentDefinition } from "./types.js";
import { builtinAgents } from "./agent-catalog.js";

export class AgentSettingsRepository {
  constructor(private readonly database: ConfigDatabase) {}

  read(): { agents: AgentDefinition[] } {
    const rows = this.database.connection
      .prepare(
        "SELECT id, definition_json, created_at, updated_at FROM agent_definitions ORDER BY created_at ASC, rowid ASC",
      )
      .all();
    return {
      agents: [
        ...structuredClone(builtinAgents),
        ...rows.map((row) => ({
          ...JSON.parse(String(row.definition_json)),
          id: String(row.id),
          source: "custom" as const,
          createdAt: Number(row.created_at),
          updatedAt: Number(row.updated_at),
        })),
      ],
    };
  }

  saveAgent(agent: AgentDefinition) {
    const { id, source: _source, createdAt, updatedAt, ...definition } = agent;
    return this.database.transaction(() => {
      this.database.connection
        .prepare(
          `INSERT INTO agent_definitions (id, definition_json, created_at, updated_at)
        VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET definition_json=excluded.definition_json, updated_at=excluded.updated_at`,
        )
        .run(id, JSON.stringify(definition), createdAt, updatedAt);
      return this.read();
    });
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
