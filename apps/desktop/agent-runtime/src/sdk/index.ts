import { createRuntimeEngine } from "../engines/index.js";
import type { AgentRuntimeEngine, RuntimeEngineCallbacks } from "../engines/runtime.js";
import type { AgentRuntimeEvent, AgentRuntimeResult, AskUserInput } from "../engines/protocol/index.js";

export type AgentRuntimeUserInputRequest = {
  taskId: string;
  question: string;
  context?: string | null;
  input?: AskUserInput | null;
};

export type AgentRuntimeUserInputHandler = (request: AgentRuntimeUserInputRequest) => Promise<string>;

export type AgentRuntimeSdkOptions = {
  profileId?: string | null;
  callbacks?: {
    onEvent?: (event: AgentRuntimeEvent) => void;
    onResult?: (result: AgentRuntimeResult) => void;
    requestUserInput?: AgentRuntimeUserInputHandler;
  };
};

export const createAgentRuntime = (options: AgentRuntimeSdkOptions = {}): AgentRuntimeEngine => {
  const callbacks = options.callbacks;
  const requestUserInput = callbacks?.requestUserInput;
  const runtimeCallbacks: RuntimeEngineCallbacks = {};

  if (callbacks?.onEvent) {
    runtimeCallbacks.onEvent = callbacks.onEvent;
  }
  if (callbacks?.onResult) {
    runtimeCallbacks.onResult = callbacks.onResult;
  }
  if (requestUserInput) {
    runtimeCallbacks.requestUserInput = (request) =>
      requestUserInput({
        ...request,
        input: request.input ?? null,
      });
  }

  const runtimeOptions = {
    profileId: options.profileId,
    ...(Object.keys(runtimeCallbacks).length > 0 ? { callbacks: runtimeCallbacks } : {}),
  };

  return createRuntimeEngine(runtimeOptions);
};
