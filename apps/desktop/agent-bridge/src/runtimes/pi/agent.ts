import { BridgeEventType } from "../../contracts/protocol.js";
import type {
  AgentRunResult,
  AgentRuntime,
  AgentRuntimeContext,
  RuntimeStartTaskCommand,
} from "../types.js";
import {
  createPiAgentRunState,
  reportPiAgentRunError,
  subscribeToPiAgentSession,
} from "./events.js";
import { drivePiAgentSession } from "./prompts.js";
import {
  createPiAgentSession,
  type PiAgentSession,
} from "./session.js";

export class PiAgent implements AgentRuntime {
  readonly id = "pi";

  async run(command: RuntimeStartTaskCommand, { askUser, emit }: AgentRuntimeContext): Promise<AgentRunResult> {
    const state = createPiAgentRunState();
    let session: PiAgentSession | null = null;
    let unsubscribe: (() => void) | null = null;

    try {
      const createdSession = await createPiAgentSession(command, askUser);
      session = createdSession.session;
      unsubscribe = subscribeToPiAgentSession(command, session, emit, state);
      emit({ type: BridgeEventType.Started, taskId: command.taskId });

      const result = await drivePiAgentSession({
        command,
        session,
        askUser,
        emit,
        state,
        shouldBootstrap: createdSession.shouldBootstrap,
      });

      emit({
        type: BridgeEventType.Done,
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
}
