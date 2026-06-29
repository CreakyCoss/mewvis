import { AgentEventType } from "../../../contracts/events.js";
import type {
  AgentCompactResult,
  AgentRunResult,
  AgentRuntime,
  AgentRuntimeContext,
  RuntimeAgentCompactCommand,
  RuntimeAgentCommand,
} from "../../types.js";
import {
  createPiAgentRunState,
  reportPiAgentRunError,
  subscribeToPiAgentSession,
} from "./events.js";
import { drivePiAgentSession } from "./driver.js";
import {
  createPiAgentSession,
  type PiAgentSession,
} from "./session.js";

export class PiAgent implements AgentRuntime {
  readonly id = "pi";

  async run(command: RuntimeAgentCommand, { callbacks, emit }: AgentRuntimeContext): Promise<AgentRunResult> {
    const state = createPiAgentRunState();
    let session: PiAgentSession | null = null;
    let unsubscribe: (() => void) | null = null;

    try {
      const createdSession = await createPiAgentSession(command, callbacks);
      session = createdSession.session;
      unsubscribe = subscribeToPiAgentSession(command, session, emit, state);
      emit({ type: AgentEventType.Started, taskId: command.taskId });

      const result = await drivePiAgentSession({
        command,
        session,
        callbacks,
        emit,
        state,
        shouldBootstrap: createdSession.shouldBootstrap,
      });

      emit({
        type: AgentEventType.Done,
        taskId: command.taskId,
        text: result.text,
      });
      return result;
    } catch (error: unknown) {
      reportPiAgentRunError(command, emit, error, state);
      throw error;
    } finally {
      unsubscribe?.();
      session?.dispose();
    }
  }

  async compact(
    command: RuntimeAgentCompactCommand,
    { callbacks }: AgentRuntimeContext,
  ): Promise<AgentCompactResult> {
    const { session } = await createPiAgentSession(command, callbacks);
    try {
      const result = await session.compact(command.compactInstructions?.trim() || undefined);
      return {
        compacted: true,
        details: result,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes("Nothing to compact") ||
        message.includes("Already compacted")
      ) {
        return {
          compacted: false,
          message,
        };
      }
      throw error;
    } finally {
      session.dispose();
    }
  }
}
