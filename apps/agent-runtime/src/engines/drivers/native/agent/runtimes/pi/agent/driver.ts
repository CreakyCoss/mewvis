import { AgentRuntimeEventType } from "../../../../../../protocol/wire.js";
import type {
  AgentRunResult,
  AgentRuntimeCallbacks,
  AgentRuntimeNativeSession,
  EmitAgentEvent,
  RuntimeAgentCommand,
} from "../../types.js";
import { throwPiSessionError, type PiAgentRunState } from "./events.js";
import { createPiAskUserContinuationPrompt, createPiInitialPrompt } from "./prompts.js";
import type { PiAgentSession } from "./session.js";
import { parsePiAskUserFunctionCall } from "../tools/ask-user-parser.js";
import { isPiAbortError, normalizePiAbortError } from "./abort.js";
import { withIdleTimeout } from "./idle-timeout.js";

// 这是连续无事件的失联保护，不是单次开书或 Agent 任务的总时长上限。
const PROMPT_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

type DrivePiAgentSessionInput = {
  command: RuntimeAgentCommand;
  session: PiAgentSession;
  callbacks: AgentRuntimeCallbacks;
  emit: EmitAgentEvent;
  nativeSession?: AgentRuntimeNativeSession;
  state: PiAgentRunState;
  shouldBootstrap: boolean;
};

export const drivePiAgentSession = async ({
  command,
  session,
  callbacks,
  emit,
  nativeSession,
  state,
  shouldBootstrap,
}: DrivePiAgentSessionInput): Promise<AgentRunResult> => {
  let nextPrompt: string | null = await createPiInitialPrompt(command, shouldBootstrap, nativeSession);
  while (nextPrompt) {
    state.assistantText = "";
    state.streamedText = "";
    state.sessionError = null;
    await runPromptWithIdleTimeout(session, nextPrompt, state);
    throwPiSessionError(state);

    nextPrompt = await nextPromptFromAskUserToolCall(command, callbacks, emit, state);
  }

  return {
    text: state.assistantText.trim(),
  };
};

const nextPromptFromAskUserToolCall = async (
  command: RuntimeAgentCommand,
  callbacks: AgentRuntimeCallbacks,
  emit: EmitAgentEvent,
  state: PiAgentRunState,
) => {
  const toolCall = parsePiAskUserFunctionCall(state.assistantText || state.streamedText);
  if (!toolCall) {
    return null;
  }

  emit({
    type: AgentRuntimeEventType.ReplaceText,
    taskId: command.taskId,
    text: "",
  });
  const answer = await callbacks.requestUserInput({
    taskId: command.taskId,
    question: toolCall.question,
    context: toolCall.context,
    input: toolCall.input,
  });
  return createPiAskUserContinuationPrompt(answer);
};

const runPromptWithIdleTimeout = async (session: PiAgentSession, prompt: string, state: PiAgentRunState) => {
  try {
    await withIdleTimeout(() => session.prompt(prompt), {
      timeoutMs: PROMPT_IDLE_TIMEOUT_MS,
      message: `Agent session 连续 ${formatTimeout(PROMPT_IDLE_TIMEOUT_MS)}无活动，已中止`,
      subscribe: (onActivity) => session.subscribe(() => onActivity()),
      onTimeout: async (error) => {
        state.sessionError ??= error;
        try {
          await session.abort();
        } catch (abortError) {
          if (!isPiAbortError(abortError)) throw abortError;
        }
      },
    });
  } catch (error) {
    throw normalizePiAbortError(error);
  }
};

const formatTimeout = (timeoutMs: number) => {
  const minutes = Math.round(timeoutMs / 60_000);
  return `${minutes} 分钟`;
};
