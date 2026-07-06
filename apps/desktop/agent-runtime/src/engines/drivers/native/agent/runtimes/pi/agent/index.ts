import { AgentEventType } from "../../../../../../protocol/index.js";
import type {
  AgentRunResult,
  AgentRuntime,
  AgentRuntimeContext,
  RuntimeAgentCompactCommand,
  RuntimeAgentCommand,
  RuntimeAgentRebuildCommand,
  RuntimeAgentSummarizeCommand,
} from "../../types.js";
import type { SessionMutationResult } from "../../../../../../protocol/index.js";
import { createPiAgentRunState, reportPiAgentRunError, subscribeToPiAgentSession } from "./events.js";
import { drivePiAgentSession } from "./driver.js";
import { createPiAgentSession, type PiAgentSession } from "./session.js";
import { compactPiAgentSession, rebuildPiAgentSession, summarizePiAgentSession } from "./maintenance.js";

export class PiAgent implements AgentRuntime {
  readonly id = "pi";

  async run(
    command: RuntimeAgentCommand,
    { callbacks, emit, nativeSession }: AgentRuntimeContext,
  ): Promise<AgentRunResult> {
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
        nativeSession,
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
  ): Promise<SessionMutationResult> {
    return compactPiAgentSession(command, { callbacks, emit: () => undefined });
  }

  async rebuild(
    command: RuntimeAgentRebuildCommand,
    { callbacks, nativeSession }: AgentRuntimeContext,
  ): Promise<SessionMutationResult> {
    return rebuildPiAgentSession(command, {
      callbacks,
      emit: () => undefined,
      nativeSession,
    });
  }

  async summarize(
    command: RuntimeAgentSummarizeCommand,
    { callbacks, nativeSession }: AgentRuntimeContext,
  ): Promise<SessionMutationResult> {
    return summarizePiAgentSession(command, {
      callbacks,
      emit: () => undefined,
      nativeSession,
    });
  }
}
