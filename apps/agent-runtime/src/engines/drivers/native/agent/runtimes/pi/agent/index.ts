import { piExtensionAdapter } from "../extensions/index.js";
import { AgentRuntimeEventType } from "../../../../../../protocol/wire.js";
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
  readonly extensionAdapter = piExtensionAdapter;

  async run(
    command: RuntimeAgentCommand,
    { callbacks, emit, nativeSession, extensions, signal }: AgentRuntimeContext,
  ): Promise<AgentRunResult> {
    const state = createPiAgentRunState();
    let session: PiAgentSession | null = null;
    let disposeResources: (() => Promise<void>) | null = null;
    let unsubscribe: (() => void) | null = null;

    const abort = () => {
      void session?.abort().catch(() => undefined);
    };
    try {
      const createdSession = await createPiAgentSession(command, callbacks, {
        extensions,
        signal,
      });
      session = createdSession.session;
      signal?.addEventListener("abort", abort, { once: true });
      disposeResources = createdSession.disposeResources;
      signal?.throwIfAborted();
      unsubscribe = subscribeToPiAgentSession(command, session, emit, state);
      emit({ type: AgentRuntimeEventType.Started, taskId: command.taskId });

      const result = await drivePiAgentSession({
        command,
        session,
        callbacks,
        emit,
        nativeSession,
        state,
        shouldBootstrap: createdSession.shouldBootstrap,
      });

      signal?.throwIfAborted();
      emit({
        type: AgentRuntimeEventType.Done,
        taskId: command.taskId,
        text: result.text,
      });
      return result;
    } catch (error: unknown) {
      reportPiAgentRunError(command, emit, error, state);
      throw error;
    } finally {
      signal?.removeEventListener("abort", abort);
      unsubscribe?.();
      try {
        session?.dispose();
      } finally {
        await disposeResources?.();
      }
    }
  }

  async compact(command: RuntimeAgentCompactCommand, context: AgentRuntimeContext): Promise<SessionMutationResult> {
    return compactPiAgentSession(command, context);
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
