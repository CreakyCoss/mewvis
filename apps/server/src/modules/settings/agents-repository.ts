import type { ConfigDatabase } from "../../storage/config/database.js";
import type { AiAgent, CollaborationWorkflow, WorkflowStep } from "./types.js";

export class AgentSettingsRepository {
  constructor(private readonly database: ConfigDatabase) {}

  read(): {
    agents: AiAgent[];
    collaborationWorkflows: CollaborationWorkflow[];
  } {
    const db = this.database.connection;
    const agents = db
      .prepare(
        `SELECT id, name, avatar, description, created_at AS createdAt,
      updated_at AS updatedAt FROM ai_agents ORDER BY created_at ASC, rowid ASC`,
      )
      .all();
    const workflows = db
      .prepare(
        `SELECT id, name, description, writer_agent_id AS writerAgentId,
      reviewer_agent_id AS reviewerAgentId, draft_instruction AS draftInstruction,
      review_instruction AS reviewInstruction, revise_instruction AS reviseInstruction,
      steps_json AS steps, created_at AS createdAt, updated_at AS updatedAt
      FROM collaboration_workflows ORDER BY created_at ASC, rowid ASC`,
      )
      .all();
    return {
      agents: agents.map((agent) => ({ ...agent }) as unknown as AiAgent),
      collaborationWorkflows: workflows.map(
        (workflow) =>
          ({
            ...workflow,
            steps:
              workflow.steps == null || !String(workflow.steps).trim()
                ? []
                : (JSON.parse(String(workflow.steps)) as WorkflowStep[]).filter(
                    (step) => step.name.trim() && step.agentId.trim(),
                  ),
          }) as unknown as CollaborationWorkflow,
      ),
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

  saveWorkflow(w: CollaborationWorkflow) {
    return this.database.transaction(() => {
      this.database.connection
        .prepare(
          `INSERT INTO collaboration_workflows
        (id, name, description, writer_agent_id, reviewer_agent_id, draft_instruction,
        review_instruction, revise_instruction, steps_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET
        name = excluded.name, description = excluded.description, writer_agent_id = excluded.writer_agent_id,
        reviewer_agent_id = excluded.reviewer_agent_id, draft_instruction = excluded.draft_instruction,
        review_instruction = excluded.review_instruction, revise_instruction = excluded.revise_instruction,
        steps_json = excluded.steps_json, updated_at = excluded.updated_at`,
        )
        .run(
          w.id,
          w.name,
          w.description,
          w.writerAgentId,
          w.reviewerAgentId,
          w.draftInstruction,
          w.reviewInstruction,
          w.reviseInstruction,
          JSON.stringify(w.steps),
          w.createdAt,
          w.updatedAt,
        );
      return this.read();
    });
  }

  deleteAgent(id: string) {
    return this.database.transaction(() => {
      // Tauri keeps saved workflow references when deleting an Agent.
      this.database.connection
        .prepare("DELETE FROM ai_agents WHERE id = ?")
        .run(id);
      return this.read();
    });
  }

  deleteWorkflow(id: string) {
    return this.database.transaction(() => {
      this.database.connection
        .prepare("DELETE FROM collaboration_workflows WHERE id = ?")
        .run(id);
      return this.read();
    });
  }
}
