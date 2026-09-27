import type { ConfigDatabase } from "../../storage/config/database.js";
import type { AiAgent } from "./types.js";

export class AgentSettingsRepository {
  constructor(private readonly database: ConfigDatabase) {}

  read(): { agents: AiAgent[] } {
    const db = this.database.connection;
    const agents = db
      .prepare(
        `SELECT id, name, avatar, description, created_at AS createdAt,
      updated_at AS updatedAt FROM ai_agents ORDER BY created_at ASC, rowid ASC`,
      )
      .all();
    return {
      agents: agents.map((agent) => ({ ...agent }) as unknown as AiAgent),
    };
  }

  saveAgent(agent: AiAgent) {
    return this.database.transaction(() => {
      this.database.connection
        .prepare(
          `INSERT INTO ai_agents (id, name, avatar, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name,
        avatar = excluded.avatar, description = excluded.description, updated_at = excluded.updated_at`,
        )
        .run(
          agent.id,
          agent.name,
          agent.avatar,
          agent.description,
          agent.createdAt,
          agent.updatedAt,
        );
      return this.read();
    });
  }

  deleteAgent(id: string) {
    return this.database.transaction(() => {
      this.database.connection
        .prepare("DELETE FROM ai_agents WHERE id = ?")
        .run(id);
      return this.read();
    });
  }
}
