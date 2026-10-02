export { createAgentRuntime } from "./sdk/index.js";
export { createExtensionPackageManager, readExtensionPackage, resolveExtensionPackages } from "@mewvis/extension-host/management";
export type { ExtensionPackageRegistration, ExtensionPackageRecord } from "@mewvis/extension-host/management";
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
export type { ExtensionSource } from "@mewvis/extension-host";
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
