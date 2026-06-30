import {
  createRuntimeEngine,
} from "../engines/index.js";
import type { AgentRuntimeEngine } from "../engines/runtime.js";
import type { AskUserInput } from "../engines/protocol/index.js";

type AgentRuntimeUserInputRequest = {
  taskId: string;
  question: string;
  context?: string | null;
  input?: AskUserInput | null;
};

type AgentRuntimeUserInputHandler = (
  request: AgentRuntimeUserInputRequest,
) => Promise<string>;

type AgentRuntimeSdkOptions = {
  callbacks?: {
    requestUserInput?: AgentRuntimeUserInputHandler;
  };
};

export const createAgentRuntime = (
  options: AgentRuntimeSdkOptions = {},
): AgentRuntimeEngine => {
  const requestUserInput = options.callbacks?.requestUserInput;
  return createRuntimeEngine({
    callbacks: requestUserInput
      ? {
          requestUserInput: (request) =>
            requestUserInput({
              ...request,
              input: request.input ?? null,
            }),
        }
      : undefined,
  });
};
