import { AgentEventType, type AgentEvent } from "../../../../../protocol/index.js";
import type {
  RuntimeAgentSessionCommand,
  RuntimeSessionCommand,
  SessionBackedRuntimeCommand,
} from "../../model/runtime-command.js";
import { isRuntimeAgentSessionCommand } from "../../model/runtime-command.js";
import type { RuntimeMessage, RuntimeSessionRecordRef } from "../../model/ledger.js";
import type { RuntimeSessionHandle, RuntimeSessionStorageProvider } from "../../internal/storage.js";
import type { RuntimeSessionAssistantMessageInput, RuntimeSessionRunRecorder } from "../types.js";
import { runtimeEntryMetadata, runtimeMessageMetadata } from "../../model/metadata.js";
import { commandParentEntryId, commandRootUserEntryId } from "../../model/runtime-link.js";
import { openRuntimeSessionStorage, refreshRuntimeSessionManifest } from "../../internal/writer.js";

type TraceRecord = {
  type: "event" | "error";
  timestamp: string;
  taskId?: string | null;
  event?: AgentEvent;
  message?: string;
};

const initialUserMessageFor = (
  command: RuntimeSessionCommand,
  baseLeafId: string | null,
  input?: {
    parentEntryId?: string | null;
    rootUserEntryId?: string | null;
  },
): RuntimeMessage | null => {
  const timestamp = Date.now();
  if (isRuntimeAgentSessionCommand(command)) {
    const content = command.userMessage.trim();
    return content
      ? {
          role: "user",
          content,
          timestamp,
          metadata: runtimeMessageMetadata({
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

const taskIdFor = (command: RuntimeSessionCommand) => command.taskId;

export class JsonlRuntimeSessionRecorder implements RuntimeSessionRunRecorder {
  private text = "";
  private thinking = "";
  private userEntryId: string | null = null;
  private requestContextEntryId: string | null = null;
  private runtimeInstructionEntryId: string | null = null;
  private intentLeafId: string | null = null;
  private assistantEntryId: string | null = null;
  private parentEntryId: string | null = null;
  private rootUserEntryId: string | null = null;

  private constructor(
    private readonly input: {
      command: SessionBackedRuntimeCommand;
      handle: RuntimeSessionHandle;
      baseLeafId: string | null;
    },
  ) {}

  static async create(
    command: SessionBackedRuntimeCommand,
    storageProvider: RuntimeSessionStorageProvider,
  ): Promise<JsonlRuntimeSessionRecorder> {
    const handle = await openRuntimeSessionStorage(command, storageProvider);
    return new JsonlRuntimeSessionRecorder({
      command,
      handle,
      baseLeafId: handle.storage.getLeafId(),
    });
  }

  async recordInitialUserMessage() {
    this.parentEntryId = this.resolveParentEntryId();
    this.rootUserEntryId = this.resolveRootUserEntryId(this.parentEntryId);
    this.intentLeafId = await this.recordIntentEntries(this.parentEntryId);

    if (this.input.command.recordUserMessage === false) {
      return;
    }

    const userEntryId = this.input.handle.storage.createEntryId();
    const message = initialUserMessageFor(this.input.command, this.input.baseLeafId, {
      parentEntryId: this.parentEntryId,
      rootUserEntryId: this.rootUserEntryId ?? userEntryId,
    });
    if (!message) {
      return;
    }

    const entry = await this.input.handle.storage.appendMessage(
      message,
      this.intentLeafId ?? this.parentEntryId ?? undefined,
      userEntryId,
    );
    this.userEntryId = entry.id;
    this.rootUserEntryId ??= entry.id;
  }

  async recordEvent(event: AgentEvent) {
    await this.appendTrace({
      type: "event",
      timestamp: new Date().toISOString(),
      taskId: taskIdFor(this.input.command),
      event,
    });

    if (event.type === AgentEventType.TextDelta) {
      this.text += event.delta;
    }
    if (event.type === AgentEventType.ThinkingDelta) {
      this.thinking += event.delta;
    }
    if (event.type === AgentEventType.ThinkingEnd) {
      this.thinking = event.content;
    }
    if (event.type === AgentEventType.Done) {
      await this.finalizeAssistantMessage({
        text: event.text,
        runStatus: "done",
      });
    }
    if (event.type === AgentEventType.Error) {
      await this.appendTrace({
        type: "error",
        timestamp: new Date().toISOString(),
        taskId: taskIdFor(this.input.command),
        message: event.message,
      });
    }
  }

  async finalizeAssistantMessage(input: RuntimeSessionAssistantMessageInput = {}) {
    const text = (input.text ?? this.text).trim();
    const thinking = (input.thinking ?? this.thinking).trim();
    if (!text && !thinking) {
      return;
    }

    const assistantParentId = this.userEntryId ?? this.intentLeafId ?? this.parentEntryId ?? undefined;
    const parentUserEntryId = this.userEntryId ?? this.rootUserEntryId;
    const entry = await this.input.handle.storage.appendMessage(
      {
        role: "assistant",
        content: text || thinking,
        timestamp: Date.now(),
        metadata: runtimeMessageMetadata({
          command: this.input.command,
          role: "assistant",
          baseLeafId: this.input.baseLeafId,
          parentEntryId: assistantParentId ?? null,
          rootUserEntryId: this.rootUserEntryId,
          parentUserEntryId,
          runStatus: input.runStatus ?? "done",
          thinking: thinking || null,
        }),
      },
      assistantParentId,
    );
    this.assistantEntryId = entry.id;
  }

  getSessionRecord(): RuntimeSessionRecordRef {
    return {
      sessionRootDir: this.input.command.sessionRootDir ?? "",
      userMessageRecordId: this.userEntryId,
      requestContextRecordId: this.requestContextEntryId,
      runtimeInstructionRecordId: this.runtimeInstructionEntryId,
      assistantMessageRecordId: this.assistantEntryId,
    };
  }

  async flush() {
    try {
      await refreshRuntimeSessionManifest(this.input.handle);
    } catch (error: unknown) {
      console.warn(`runtime session manifest 刷新失败：${String(error)}`);
    }
  }

  private async appendTrace(record: TraceRecord) {
    await this.input.handle.appendTrace(record);
  }

  private async recordIntentEntries(parentEntryId: string | null) {
    let currentParentId = parentEntryId;
    const runtimeInstruction = this.input.command.runtimeInstruction?.trim();
    if (runtimeInstruction) {
      const entry = await this.input.handle.storage.appendRuntimeInstruction(
        runtimeInstruction,
        runtimeEntryMetadata({
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
      const entry = await this.input.handle.storage.appendRequestContext(
        requestContext,
        runtimeEntryMetadata({
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

    if (!this.input.handle.storage.getEntry(parentEntryId)) {
      throw new Error(`parentEntryId 必须指向当前 runtime ledger 中已存在的 entry：${parentEntryId}`);
    }
    return parentEntryId;
  }

  private resolveRootUserEntryId(parentEntryId: string | null) {
    const rootUserEntryId = commandRootUserEntryId(this.input.command)?.trim() || null;
    if (rootUserEntryId) {
      const root = this.input.handle.storage.getEntry(rootUserEntryId);
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

    const path = this.input.handle.storage.getPathToRoot(fromEntryId);
    for (const entry of path.slice().reverse()) {
      if (entry.type === "message" && entry.message.role === "user") {
        return entry.id;
      }
    }
    return null;
  }
}
