import { createRuntimeEngine } from "../engines/index.js";
import type { AgentRuntimeEngine, RuntimeEngineCallbacks, RuntimeEngineOptions } from "../engines/runtime.js";
import type { AgentRuntimeEvent, AskUserInput } from "../engines/protocol/wire.js";
import type { AgentRuntimeResult } from "../engines/protocol/index.js";

export type AgentRuntimeUserInputRequest = {
  taskId: string;
  question: string;
  context?: string | null;
  input?: AskUserInput | null;
};

export type AgentRuntimeUserInputHandler = (request: AgentRuntimeUserInputRequest) => Promise<string>;

export type AgentRuntimeSdkOptions = {
  runtimeAgents?: RuntimeEngineOptions["runtimeAgents"];
  extensions?: RuntimeEngineOptions["extensions"];
  extensionPackages?: RuntimeEngineOptions["extensionPackages"];
  extensionSettingsPath?: string;
  bundledExtensionsPath?: string;
  profileId?: string | null;
  callbacks?: {
    onExtensionAdaptation?: RuntimeEngineCallbacks["onExtensionAdaptation"];
    onExtensionError?: RuntimeEngineCallbacks["onExtensionError"];
    onEvent?: (event: AgentRuntimeEvent) => void;
    onResult?: (result: AgentRuntimeResult) => void;
    requestUserInput?: AgentRuntimeUserInputHandler;
  };
};

export const createAgentRuntime = (options: AgentRuntimeSdkOptions = {}): AgentRuntimeEngine => {
  const callbacks = options.callbacks;
  const requestUserInput = callbacks?.requestUserInput;
  const runtimeCallbacks: RuntimeEngineCallbacks = {
    onExtensionError: callbacks?.onExtensionError,
    onExtensionAdaptation: callbacks?.onExtensionAdaptation,
  };

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
    runtimeAgents: options.runtimeAgents,
    extensions: options.extensions,
    extensionPackages: options.extensionPackages,
    extensionSettingsPath: options.extensionSettingsPath,
    bundledExtensionsPath: options.bundledExtensionsPath,
    ...(Object.keys(runtimeCallbacks).length > 0 ? { callbacks: runtimeCallbacks } : {}),
  };

  return createRuntimeEngine(runtimeOptions);
};
