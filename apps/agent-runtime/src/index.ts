export { createAgentRuntime } from "./sdk/index.js";
export { createExtensionPackageManager, readExtensionPackage, resolveExtensionPackages } from "@isle/extension-host";
export type { ExtensionPackageRegistration, ExtensionPackageRecord } from "@isle/extension-host";
export type { AgentRuntimeRunInput } from "./engines/runtime.js";
export { createAgentEngine } from "./engines/drivers/native/agent/index.js";
export { createRuntimeAgentRegistry, builtinRuntimeAgents } from "./engines/drivers/native/agent/runtimes/registry.js";
export { createScriptedMockRuntime } from "./engines/drivers/native/agent/runtimes/mock/scripted.js";
export type { MockAgentStep } from "./engines/drivers/native/agent/runtimes/mock/scripted.js";
export type {
  RuntimeAgent,
  AgentRuntime,
  AgentRuntimeContext,
  AgentRunCommand,
} from "./engines/drivers/native/agent/runtimes/types.js";
export type { ExtensionSource } from "@isle/extension-sdk";
export type {
  AgentRuntimeSdkOptions,
  AgentRuntimeUserInputHandler,
  AgentRuntimeUserInputRequest,
} from "./sdk/index.js";

export type {
  RuntimeExtensions,
  ExtensionCommandInput,
  ExtensionSessionTarget,
  ExtensionDiagnostic,
} from "./extensions/index.js";
