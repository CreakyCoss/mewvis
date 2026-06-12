import {
  BridgeEventType,
} from "../../../contracts/protocol.js";
import type {
  AgentRunResult,
  AskUser,
  EmitBridgeEvent,
  RuntimeStartTaskCommand,
} from "../../types.js";
import {
  throwPiSessionError,
  type PiAgentRunState,
} from "./events.js";
import {
  createPiAskUserContinuationPrompt,
  createPiInitialPrompt,
} from "./prompts.js";
import type { PiAgentSession } from "./session.js";
import { parsePiAskUserFunctionCall } from "../tools/ask-user-parser.js";

const PROMPT_TIMEOUT_MS = 30 * 60 * 1000;

type DrivePiAgentSessionInput = {
  command: RuntimeStartTaskCommand;
  session: PiAgentSession;
  askUser: AskUser;
  emit: EmitBridgeEvent;
  state: PiAgentRunState;
  shouldBootstrap: boolean;
};

export const drivePiAgentSession = async ({
  command,
  session,
  askUser,
  emit,
  state,
  shouldBootstrap,
}: DrivePiAgentSessionInput): Promise<AgentRunResult> => {
  let nextPrompt: string | null = createPiInitialPrompt(command, shouldBootstrap);
  while (nextPrompt) {
    state.assistantText = "";
    state.streamedText = "";
    state.sessionError = null;
    await runPromptWithTimeout(session, nextPrompt);
    throwPiSessionError(state);

    nextPrompt = await nextPromptFromAskUser(command, askUser, emit, state);
  }

  return {
    text: state.assistantText.trim(),
  };
};

const nextPromptFromAskUser = async (
  command: RuntimeStartTaskCommand,
  askUser: AskUser,
  emit: EmitBridgeEvent,
  state: PiAgentRunState,
) => {
  const askUserCall = parsePiAskUserFunctionCall(state.assistantText || state.streamedText);
  if (!askUserCall) {
    return null;
  }

  emit({
    type: BridgeEventType.ReplaceText,
    taskId: command.taskId,
    text: "",
  });
  const answer = await askUser(
    command.taskId,
    askUserCall.question,
    askUserCall.context,
    askUserCall.input,
  );
  return createPiAskUserContinuationPrompt(answer);
};

const runPromptWithTimeout = async (session: PiAgentSession, prompt: string) => {
  await withTimeout(
    session.prompt(prompt),
    PROMPT_TIMEOUT_MS,
    `Agent session 执行超时（${formatTimeout(PROMPT_TIMEOUT_MS)}）`,
  );
};

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(message));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};

const formatTimeout = (timeoutMs: number) => {
  const minutes = Math.round(timeoutMs / 60_000);
  return `${minutes} 分钟`;
};
