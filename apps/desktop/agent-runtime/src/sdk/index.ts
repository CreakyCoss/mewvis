import {
  createRuntimeEngine,
  type RuntimeEngine,
  type AskUserInput,
} from "../engine/index.js";

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

type AgentRuntimeSdk = Pick<
  RuntimeEngine,
  "agent" | "collaboration" | "waitForRunningTask"
>;

export const createAgentRuntime = (
  options: AgentRuntimeSdkOptions = {},
): AgentRuntimeSdk => {
  const requestUserInput = options.callbacks?.requestUserInput;
  const runtime = createRuntimeEngine({
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

  return {
    agent: runtime.agent,
    collaboration: runtime.collaboration,
    waitForRunningTask: runtime.waitForRunningTask,
  };
};
