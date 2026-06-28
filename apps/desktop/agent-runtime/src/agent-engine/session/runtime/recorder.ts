import { appendFile } from "node:fs/promises";
import type {
  BridgeEvent,
  ChatMessageInput,
} from "../../contracts/protocol.js";
import { BridgeEventType } from "../../contracts/protocol.js";
import type {
  AgentRunCommand,
  EmitBridgeEvent,
  RuntimeChatCommand,
} from "../../runtimes/types.js";
import type {
  BridgeMessage,
  BridgeSessionRecordRef,
} from "../core/types.js";
import { BridgeLedgerStorage } from "../storage/jsonl-store.js";
import { resolveBridgeSessionPaths } from "../storage/paths.js";
import {
  runtimeBridgeEntryMetadata,
  runtimeBridgeMessageMetadata,
} from "../metadata/runtime.js";
import {
  commandParentEntryId,
  commandRootUserEntryId,
} from "./session-link.js";

type SessionBackedCommand = (RuntimeChatCommand | AgentRunCommand) & {
  workspacePath: string;
  sessionRootDir: string;
};

type TraceRecord = {
  type: "event" | "error";
  timestamp: string;
  taskId?: string | null;
  event?: BridgeEvent;
  message?: string;
};

const isAgentRunCommand = (command: RuntimeChatCommand | AgentRunCommand): command is AgentRunCommand =>
  "runtimeMode" in command && command.runtimeMode === "agent";

const hasSession = (command: RuntimeChatCommand | AgentRunCommand): command is SessionBackedCommand => {
  const candidate = command as SessionBackedCommand;
  return (("type" in command && command.type === "chat") || isAgentRunCommand(command)) &&
    typeof candidate.workspacePath === "string" &&
    typeof candidate.sessionRootDir === "string" &&
    Boolean(candidate.workspacePath.trim() && candidate.sessionRootDir.trim());
};

const contentFromChatMessage = (message: ChatMessageInput | undefined) =>
  message?.content?.trim() ?? "";

const latestUserMessage = (command: RuntimeChatCommand) => {
  if (command.userMessage?.trim()) {
    return {
      role: "user",
      content: command.userMessage,
    };
  }

  const messages = command.messages ?? [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user") {
      return message;
    }
  }
  return messages[messages.length - 1];
};

const initialUserMessageFor = (
  command: RuntimeChatCommand | AgentRunCommand,
  baseLeafId: string | null,
  input?: {
    parentEntryId?: string | null;
    rootUserEntryId?: string | null;
  },
): BridgeMessage | null => {
  const timestamp = Date.now();
  if ("type" in command && command.type === "chat") {
    const content = contentFromChatMessage(latestUserMessage(command));
    return content
      ? {
        role: "user",
        content,
        timestamp,
        metadata: runtimeBridgeMessageMetadata({
          command,
          role: "user",
          baseLeafId,
          parentEntryId: input?.parentEntryId ?? null,
          rootUserEntryId: input?.rootUserEntryId ?? null,
        }),
      }
      : null;
  }

  if (isAgentRunCommand(command)) {
    const content = command.userMessage.trim();
    return content
      ? {
        role: "user",
        content,
        timestamp,
        metadata: runtimeBridgeMessageMetadata({
          command,
          role: "user",
          baseLeafId,
          parentEntryId: input?.parentEntryId ?? null,
          rootUserEntryId: input?.rootUserEntryId ?? null,
        }),
      }
      : null;
  }

  return null;
};

const taskIdFor = (command: RuntimeChatCommand | AgentRunCommand) =>
  "runtimeMode" in command ? command.taskId : command.streamId ?? null;

export class BridgeSessionRecorder {
  private text = "";
  private thinking = "";
  private userEntryId: string | null = null;
  private requestContextEntryId: string | null = null;
  private runtimeInstructionEntryId: string | null = null;
  private intentLeafId: string | null = null;
  private assistantEntryId: string | null = null;
  private parentEntryId: string | null = null;
  private rootUserEntryId: string | null = null;
  private pendingWrite: Promise<void> = Promise.resolve();

  private constructor(
    private readonly input: {
      command: SessionBackedCommand;
      tracePath: string;
      storage: BridgeLedgerStorage;
      baseLeafId: string | null;
    },
  ) {}

  static async create(command: RuntimeChatCommand | AgentRunCommand): Promise<BridgeSessionRecorder | null> {
    if (!hasSession(command)) {
      return null;
    }

    const paths = await resolveBridgeSessionPaths(command);
    const storage = await BridgeLedgerStorage.openOrCreate({
      filePath: paths.ledgerPath,
      workspacePath: command.workspacePath,
      sessionRootDir: command.sessionRootDir,
    });
    return new BridgeSessionRecorder({
      command,
      tracePath: paths.tracePath,
      storage,
      baseLeafId: storage.getLeafId(),
    });
  }

  async recordInitialUserMessage() {
    this.parentEntryId = this.resolveParentEntryId();
    this.rootUserEntryId = this.resolveRootUserEntryId(this.parentEntryId);
    this.intentLeafId = await this.recordIntentEntries(this.parentEntryId);

    if (this.input.command.recordUserMessage === false) {
      return null;
    }

    const userEntryId = this.input.storage.createEntryId();
    const message = initialUserMessageFor(
      this.input.command,
      this.input.baseLeafId,
      {
        parentEntryId: this.parentEntryId,
        rootUserEntryId: this.rootUserEntryId ?? userEntryId,
      },
    );
    if (!message) {
      return null;
    }

    const entry = await this.input.storage.appendMessage(
      message,
      this.intentLeafId ?? this.parentEntryId ?? undefined,
      userEntryId,
    );
    this.userEntryId = entry.id;
    this.rootUserEntryId ??= entry.id;
    return entry;
  }

  wrapEmit(baseEmit: EmitBridgeEvent): EmitBridgeEvent {
    return (event) => {
      if (event.type === BridgeEventType.Done) {
        this.pendingWrite = this.pendingWrite
          .then(async () => {
            await this.captureEvent(event);
            baseEmit(this.decorateEvent(event));
          })
          .catch((error: unknown) => {
            console.warn(`runtime session recorder 写入失败：${String(error)}`);
            baseEmit(this.decorateEvent(event));
          });
        return;
      }

      this.pendingWrite = this.pendingWrite
        .then(() => this.captureEvent(event))
        .catch((error: unknown) => {
          console.warn(`runtime session recorder 写入失败：${String(error)}`);
        });
      baseEmit(this.decorateEvent(event));
    };
  }

  async flush() {
    await this.pendingWrite;
  }

  async finalizeAssistantMessage(input: {
    text?: string | null;
    thinking?: string | null;
    runStatus?: "done" | "error";
  } = {}) {
    const text = (input.text ?? this.text).trim();
    const thinking = (input.thinking ?? this.thinking).trim();
    if (!text && !thinking) {
      return null;
    }

    const assistantParentId = this.userEntryId ?? this.intentLeafId ?? this.parentEntryId ?? undefined;
    const parentUserEntryId = this.userEntryId ?? this.rootUserEntryId;
    const entry = await this.input.storage.appendMessage({
      role: "assistant",
      content: text || thinking,
      timestamp: Date.now(),
      metadata: runtimeBridgeMessageMetadata({
        command: this.input.command,
        role: "assistant",
        baseLeafId: this.input.baseLeafId,
        parentEntryId: assistantParentId ?? null,
        rootUserEntryId: this.rootUserEntryId,
        parentUserEntryId,
        runStatus: input.runStatus ?? "done",
        thinking: thinking || null,
      }),
    }, assistantParentId);
    this.assistantEntryId = entry.id;
    return entry;
  }

  getSessionRecord(): BridgeSessionRecordRef {
    return {
      sessionRootDir: this.input.command.sessionRootDir ?? "",
      userMessageRecordId: this.userEntryId,
      requestContextRecordId: this.requestContextEntryId,
      runtimeInstructionRecordId: this.runtimeInstructionEntryId,
      assistantMessageRecordId: this.assistantEntryId,
    };
  }

  private decorateEvent(event: BridgeEvent): BridgeEvent {
    if (event.type !== BridgeEventType.Done) {
      return event;
    }

    return {
      ...event,
      bridgeSession: this.getSessionRecord(),
    };
  }

  private async captureEvent(event: BridgeEvent) {
    await this.appendTrace({
      type: "event",
      timestamp: new Date().toISOString(),
      taskId: taskIdFor(this.input.command),
      event,
    });

    if (event.type === BridgeEventType.TextDelta) {
      this.text += event.delta;
    }
    if (event.type === BridgeEventType.ThinkingDelta) {
      this.thinking += event.delta;
    }
    if (event.type === BridgeEventType.ThinkingEnd) {
      this.thinking = event.content;
    }
    if (event.type === BridgeEventType.Done) {
      await this.finalizeAssistantMessage({
        text: event.text,
        runStatus: "done",
      });
    }
    if (event.type === BridgeEventType.Error) {
      await this.appendTrace({
        type: "error",
        timestamp: new Date().toISOString(),
        taskId: taskIdFor(this.input.command),
        message: event.message,
      });
    }
  }

  private async appendTrace(record: TraceRecord) {
    await appendFile(this.input.tracePath, `${JSON.stringify(record)}\n`, "utf8");
  }

  private async recordIntentEntries(parentEntryId: string | null) {
    let currentParentId = parentEntryId;
    const runtimeInstruction = this.input.command.runtimeInstruction?.trim();
    if (runtimeInstruction) {
      const entry = await this.input.storage.appendRuntimeInstruction(
        runtimeInstruction,
        runtimeBridgeEntryMetadata({
          command: this.input.command,
          entryType: "runtime_instruction",
          baseLeafId: this.input.baseLeafId,
          parentEntryId,
          rootUserEntryId: this.rootUserEntryId,
        }),
        currentParentId,
      );
      this.runtimeInstructionEntryId = entry.id;
      currentParentId = entry.id;
    }

    const requestContext = this.input.command.requestContext?.trim();
    if (requestContext) {
      const entry = await this.input.storage.appendRequestContext(
        requestContext,
        runtimeBridgeEntryMetadata({
          command: this.input.command,
          entryType: "request_context",
          baseLeafId: this.input.baseLeafId,
          parentEntryId,
          rootUserEntryId: this.rootUserEntryId,
        }),
        currentParentId,
      );
      this.requestContextEntryId = entry.id;
      currentParentId = entry.id;
    }

    return currentParentId;
  }

  private resolveParentEntryId() {
    const parentEntryId = commandParentEntryId(this.input.command)?.trim() || null;
    if (!parentEntryId) {
      return this.input.baseLeafId;
    }

    if (!this.input.storage.getEntry(parentEntryId)) {
      throw new Error(`parentEntryId 必须指向当前 runtime ledger 中已存在的 entry：${parentEntryId}`);
    }
    return parentEntryId;
  }

  private resolveRootUserEntryId(parentEntryId: string | null) {
    const rootUserEntryId = commandRootUserEntryId(this.input.command)?.trim() || null;
    if (rootUserEntryId) {
      const root = this.input.storage.getEntry(rootUserEntryId);
      if (!root || root.type !== "message" || root.message.role !== "user") {
        throw new Error(`rootUserEntryId 必须指向当前 runtime ledger 中的 user message：${rootUserEntryId}`);
      }
      return rootUserEntryId;
    }

    return this.findNearestUserEntryId(parentEntryId);
  }

  private findNearestUserEntryId(fromEntryId: string | null) {
    if (!fromEntryId) {
      return null;
    }

    const path = this.input.storage.getPathToRoot(fromEntryId);
    for (const entry of path.slice().reverse()) {
      if (entry.type === "message" && entry.message.role === "user") {
        return entry.id;
      }
    }
    return null;
  }
}
