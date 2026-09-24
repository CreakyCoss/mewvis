import {
  resolveExtensionPackages,
  loadExtensionSettingsSources,
} from "@isle/extension-host/management";
import {
  createExtensionRuntime,
  type RuntimeExtensions,
} from "../../../extensions/index.js";
import {
  AgentRuntimeEngine,
  type AgentRuntimeAgent,
  type AgentRuntimeCapabilities,
  type AgentRuntimeCollaboration,
  type AgentRuntimeSession,
  type RuntimeEngineOptions,
} from "../../runtime.js";
import type { AgentRuntimeEvent } from "../../protocol/wire.js";
import type {
  AgentRuntimeCommand,
  AgentRuntimeResult,
  PongResult,
  ShutdownAckResult,
} from "../../protocol/index.js";
import { createUserInputManager } from "./agent/commands/user-input.js";
import {
  createPongResult,
  createShutdownAckResult,
} from "./agent/commands/responses.js";
import {
  builtinRuntimeAgents,
  createRuntimeAgentRegistry,
} from "./agent/runtimes/registry.js";
import { executeAgentRunCommand } from "./agent/commands/execution.js";
import { createAgentEngine } from "./agent/index.js";
import type {
  AgentRuntimeCallbacks,
  EmitAgentEvent,
} from "./agent/runtimes/types.js";
import { createCollaborationEngine } from "./collaboration/index.js";
import type {
  EmitCollaborationEvent,
  RunAgentForCollaboration,
} from "./collaboration/runtimes/types.js";
import {
  createNativeRuntimeCommandRouter,
  type NativeRuntimeCommandRouter,
} from "./router.js";
import { resolveNativeRuntimeProfile } from "./profile.js";
import {
  NativeAgentRuntimeAgentSurface,
  NativeAgentRuntimeCapabilitiesSurface,
  NativeAgentRuntimeCollaborationSurface,
  NativeAgentRuntimeSessionSurface,
} from "./surfaces.js";

export class NativeAgentRuntimeEngine extends AgentRuntimeEngine {
  readonly id = "native";
  readonly extensions: RuntimeExtensions;
  readonly capabilities: AgentRuntimeCapabilities;
  readonly agent: AgentRuntimeAgent;
  readonly session: AgentRuntimeSession;
  readonly collaboration: AgentRuntimeCollaboration;

  private readonly close: () => void;
  private readonly emitEvent: (event: AgentRuntimeEvent) => void;
  private readonly emitResult: (result: AgentRuntimeResult) => void;
  private readonly agentSurface: NativeAgentRuntimeAgentSurface;
  private readonly commandRouter: NativeRuntimeCommandRouter;
  private readonly extensionRuntime = createExtensionRuntime();

  constructor({
    callbacks,
    close = () => undefined,
    profileId,
    runtimeAgents = [],
    extensions,
    extensionPackages,
    extensionSettingsPath,
    bundledExtensionsPath,
    reloadExtensionSettings = false,
  }: RuntimeEngineOptions = {}) {
    super();

    const profile = resolveNativeRuntimeProfile(profileId);
    this.close = close;
    this.emitEvent = callbacks?.onEvent ?? (() => undefined);
    this.emitResult = callbacks?.onResult ?? (() => undefined);

    const userInput = createUserInputManager(this.emitAgentEvent);
    const runtimeCallbacks: AgentRuntimeCallbacks = {
      ...userInput.callbacks,
      onExtensionError: callbacks?.onExtensionError,
      onExtensionAdaptation: callbacks?.onExtensionAdaptation,
      requestUserInput:
        callbacks?.requestUserInput ?? userInput.callbacks.requestUserInput,
    };
    const registry = createRuntimeAgentRegistry([
      ...builtinRuntimeAgents,
      ...runtimeAgents,
    ]);
    runtimeCallbacks.runExtensionTask = (command, context) =>
      executeAgentRunCommand(command, context, {
        registry,
        agentRuntimeId: profile.agentRuntimeId,
        sessionProviderId: profile.sessionProviderId,
        extensions: [],
      });
    const directSources = this.extensionRuntime.snapshotSources([
      ...(extensions ?? []),
      ...resolveExtensionPackages(extensionPackages ?? []),
    ]);
    const loadSources = () =>
      this.extensionRuntime.snapshotSources([
        ...directSources,
        ...loadExtensionSettingsSources(extensionSettingsPath, {
          bundledPath: bundledExtensionsPath,
        }),
      ]);
    const extensionSources = reloadExtensionSettings
      ? undefined
      : loadSources();
    const getExtensionSources = extensionSources
      ? () => extensionSources
      : loadSources;
    this.extensions = this.extensionRuntime.bindCommands(
      getExtensionSources,
      runtimeCallbacks,
    );
    const agentEngine = createAgentEngine({
      registry,
      getExtensionSources,
      extensionRuntime: this.extensionRuntime,
      agentRuntimeId: profile.agentRuntimeId,
      chatRuntimeId: profile.chatRuntimeId,
      sessionProviderId: profile.sessionProviderId,
    });

    const runAgentForCollaboration: RunAgentForCollaboration = (
      command,
      context,
    ) =>
      agentEngine.runAgent(command, {
        callbacks: runtimeCallbacks,
        emit: context.emit,
      });
    const collaborationEngine = createCollaborationEngine({
      runAgent: runAgentForCollaboration,
      defaultRuntimeId: profile.collaborationRuntimeId,
      sessionProviderId: profile.sessionProviderId,
    });

    this.capabilities = new NativeAgentRuntimeCapabilitiesSurface();
    this.agentSurface = new NativeAgentRuntimeAgentSurface({
      agentEngine,
      emitAgentEvent: this.emitAgentEvent,
      runtimeCallbacks,
      userInput,
    });
    this.agent = this.agentSurface;
    this.session = new NativeAgentRuntimeSessionSurface({
      getExtensionSources,
      extensionRuntime: this.extensionRuntime,
      registry,
      emitAgentEvent: this.emitAgentEvent,
      profile,
      runtimeCallbacks,
    });
    this.collaboration = new NativeAgentRuntimeCollaborationSurface({
      collaborationEngine,
      emitCollaborationEvent: this.emitCollaborationEvent,
      profile,
    });
    this.commandRouter = createNativeRuntimeCommandRouter({
      engine: this,
      emitEvent: this.emitEvent,
      emitResult: this.emitResult,
      answerApproval: (input) => this.agentSurface.answerApproval(input),
      answerQuestion: (input) => this.agentSurface.answerQuestion(input),
      runAgentCommand: (command) => this.agentSurface.runCommand(command),
    });
  }

  async handle(command: AgentRuntimeCommand): Promise<boolean> {
    return this.commandRouter.handle(command);
  }

  async ping(): Promise<PongResult> {
    return createPongResult({});
  }

  async shutdown(): Promise<ShutdownAckResult> {
    const result = createShutdownAckResult({});
    await this.extensionRuntime.dispose();
    this.close();
    return result;
  }

  async waitForRunningTask() {
    await this.commandRouter.waitForRunningTask();
  }

  private readonly emitAgentEvent: EmitAgentEvent = (event) => {
    this.emitEvent(event);
  };

  private readonly emitCollaborationEvent: EmitCollaborationEvent = (event) => {
    this.emitEvent(event);
  };
}

export const createNativeRuntimeEngine = (options: RuntimeEngineOptions = {}) =>
  new NativeAgentRuntimeEngine(options);
