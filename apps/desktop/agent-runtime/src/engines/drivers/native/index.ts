import {
  AgentRuntimeEngine,
  type AgentRuntimeAgent,
  type AgentRuntimeCapabilities,
  type AgentRuntimeCollaboration,
  type AgentRuntimeSession,
  type RuntimeEngineOptions,
} from "../../runtime.js";
import type {
  AgentRuntimeCommand,
  AgentRuntimeEvent,
  AgentRuntimeResult,
  PongResult,
  ShutdownAckResult,
} from "../../protocol/index.js";
import { createUserInputManager } from "./agent/commands/user-input.js";
import {
  createPongResult,
  createShutdownAckResult,
} from "./agent/commands/responses.js";
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
  readonly capabilities: AgentRuntimeCapabilities;
  readonly agent: AgentRuntimeAgent;
  readonly session: AgentRuntimeSession;
  readonly collaboration: AgentRuntimeCollaboration;

  private readonly close: () => void;
  private readonly emitEvent: (event: AgentRuntimeEvent) => void;
  private readonly emitResult: (result: AgentRuntimeResult) => void;
  private readonly agentSurface: NativeAgentRuntimeAgentSurface;
  private readonly commandRouter: NativeRuntimeCommandRouter;

  constructor({
    callbacks,
    close = () => undefined,
    profileId,
  }: RuntimeEngineOptions = {}) {
    super();

    const profile = resolveNativeRuntimeProfile(profileId);
    this.close = close;
    this.emitEvent = callbacks?.onEvent ?? (() => undefined);
    this.emitResult = callbacks?.onResult ?? (() => undefined);

    const userInput = createUserInputManager(this.emitAgentEvent);
    const runtimeCallbacks: AgentRuntimeCallbacks = {
      requestUserInput: callbacks?.requestUserInput ??
        userInput.callbacks.requestUserInput,
    };
    const agentEngine = createAgentEngine({
      agentRuntimeId: profile.agentRuntimeId,
      chatRuntimeId: profile.chatRuntimeId,
      sessionProviderId: profile.sessionProviderId,
    });

    const runAgentForCollaboration: RunAgentForCollaboration = (command, context) =>
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
