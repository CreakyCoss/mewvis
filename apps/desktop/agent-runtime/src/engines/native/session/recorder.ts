import {
  AgentEventType,
  type AgentEvent,
} from "../../protocol/index.js";
import type {
  RuntimeSessionCommand,
  SessionBackedRuntimeCommand,
} from "./model/runtime-command.js";
import { isRuntimeAgentSessionCommand } from "./model/runtime-command.js";
import type { RuntimeSessionRecordRef } from "./model/context.js";
import { resolveRuntimeSessionProvider } from "./providers/resolver.js";
import type {
  RuntimeSessionAssistantMessageInput,
  RuntimeSessionRunRecorder,
} from "./providers/types.js";

type EmitAgentEvent = (event: AgentEvent) => void;

const isChatRunCommand = (
  command: RuntimeSessionCommand,
) =>
  "type" in command && command.type === "chat";

const hasSession = (command: RuntimeSessionCommand): command is SessionBackedRuntimeCommand => {
  const candidate = command as SessionBackedRuntimeCommand;
  return (isChatRunCommand(command) || isRuntimeAgentSessionCommand(command)) &&
    Boolean(candidate.workspacePath.trim() && candidate.sessionRootDir.trim());
};

export class RuntimeSessionRecorder {
  private pendingWrite: Promise<void> = Promise.resolve();

  private constructor(
    private readonly delegate: RuntimeSessionRunRecorder,
  ) {}

  static async create(command: RuntimeSessionCommand): Promise<RuntimeSessionRecorder | null> {
    if (!hasSession(command)) {
      return null;
    }

    return new RuntimeSessionRecorder(
      await resolveRuntimeSessionProvider().createRecorder(command),
    );
  }

  recordInitialUserMessage() {
    return this.delegate.recordInitialUserMessage();
  }

  wrapEmit(baseEmit: EmitAgentEvent): EmitAgentEvent {
    return (event) => {
      if (event.type === AgentEventType.Done) {
        this.pendingWrite = this.pendingWrite
          .then(async () => {
            await this.delegate.recordEvent(event);
            baseEmit(this.decorateEvent(event));
          })
          .catch((error: unknown) => {
            console.warn(`runtime session recorder 写入失败：${String(error)}`);
            baseEmit(this.decorateEvent(event));
          });
        return;
      }

      this.pendingWrite = this.pendingWrite
        .then(() => this.delegate.recordEvent(event))
        .catch((error: unknown) => {
          console.warn(`runtime session recorder 写入失败：${String(error)}`);
        });
      baseEmit(this.decorateEvent(event));
    };
  }

  async flush() {
    await this.pendingWrite;
    await this.delegate.flush();
  }

  finalizeAssistantMessage(input: RuntimeSessionAssistantMessageInput = {}) {
    return this.delegate.finalizeAssistantMessage(input);
  }

  getSessionRecord(): RuntimeSessionRecordRef {
    return this.delegate.getSessionRecord();
  }

  private decorateEvent(event: AgentEvent): AgentEvent {
    if (event.type !== AgentEventType.Done) {
      return event;
    }

    return {
      ...event,
      runtimeSession: this.getSessionRecord(),
    };
  }
}
