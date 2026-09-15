import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { AgentRuntimeResultType, AgentRuntimeEventType, type AgentRuntimeEvent } from "../engines/protocol/wire.js";
import {
  AgentRuntimeCommandType,
  AgentTaskCommandType,
  type AgentRuntimeCommand,
  type AgentRuntimeResult,
} from "../engines/protocol/index.js";
import {
  JsonRpcProtocolError,
  agentRuntimeCommandFromJsonRpc,
  createJsonRpcErrorResponse,
  createJsonRpcSuccessResponse,
  createRuntimeNotification,
  type JsonRpcId,
} from "./json-rpc.js";

export type StdioRuntimeReader = ReturnType<typeof createInterface>;

export const createStdioRuntimeReader = (): StdioRuntimeReader => createInterface({ input });

export const writeJsonLine = (value: unknown) => {
  output.write(`${JSON.stringify(value)}\n`);
};

type PendingJsonRpcRequest = {
  id: JsonRpcId;
  allowAdditionalResult: boolean;
  responded: boolean;
};

const additionalResultCommandTypes = new Set<string>([
  AgentRuntimeCommandType.RunCollaboration,
  AgentRuntimeCommandType.RunCollaborationMode,
]);

export class AgentRuntimeStdioProtocol {
  private sequence = 0;
  private handlingCommand = false;
  private activeRequestId: string | null = null;
  private activeEventTaskId: string | null = null;
  private readonly pendingRequests = new Map<string, PendingJsonRpcRequest>();

  constructor(private readonly write: (value: unknown) => void = writeJsonLine) {}

  parseCommand(line: string): AgentRuntimeCommand {
    if (!line.trim()) {
      throw new JsonRpcProtocolError(-32600, "Invalid Request");
    }

    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new JsonRpcProtocolError(-32700, "Parse error");
    }

    const id =
      value && typeof value === "object" && "id" in value
        ? ((value as { id?: unknown }).id as JsonRpcId | undefined)
        : undefined;
    const internalRequestId = id === undefined ? null : `jsonrpc:${++this.sequence}`;
    const command = agentRuntimeCommandFromJsonRpc(value, internalRequestId);
    if (internalRequestId && id !== undefined) {
      this.pendingRequests.set(internalRequestId, {
        id,
        allowAdditionalResult: additionalResultCommandTypes.has(command.type),
        responded: false,
      });
    }
    return command;
  }

  beginCommand(command: AgentRuntimeCommand) {
    this.handlingCommand = true;
    this.activeRequestId = command.requestId ?? null;
    const commandWithTaskIdentity = command as AgentRuntimeCommand & {
      taskId?: string | null;
      streamId?: string | null;
      input?: { requestId?: string | null };
    };
    this.activeEventTaskId =
      commandWithTaskIdentity.taskId ??
      commandWithTaskIdentity.streamId ??
      commandWithTaskIdentity.input?.requestId ??
      null;
  }

  endCommand(command: AgentRuntimeCommand) {
    if (
      (command.type === AgentTaskCommandType.AnswerQuestion || command.type === AgentTaskCommandType.AnswerApproval) &&
      command.requestId
    ) {
      const pending = this.pendingRequests.get(command.requestId);
      if (pending && !pending.responded) {
        this.write(createJsonRpcSuccessResponse(pending.id, { type: "ack" }));
        this.pendingRequests.delete(command.requestId);
      }
    }
    if (this.activeRequestId === command.requestId) {
      this.activeRequestId = null;
    }
    this.activeEventTaskId = null;
    this.handlingCommand = false;
  }

  writeEvent(event: AgentRuntimeEvent) {
    const eventTaskId = "taskId" in event && typeof event.taskId === "string" ? event.taskId : null;
    const belongsToActiveRequest =
      !eventTaskId || eventTaskId === this.activeRequestId || eventTaskId === this.activeEventTaskId;
    if (event.type === AgentRuntimeEventType.Error && this.activeRequestId && belongsToActiveRequest) {
      const pending = this.pendingRequests.get(this.activeRequestId);
      if (pending && !pending.responded) {
        this.pendingRequests.delete(this.activeRequestId);
        this.write(
          createJsonRpcErrorResponse(pending.id, -32000, event.message, {
            event,
          }),
        );
        return;
      }
    }

    this.write(createRuntimeNotification("runtime/event", this.withExternalRequestIdentity(event)));
  }

  writeResult(result: AgentRuntimeResult) {
    const requestId = result.requestId;
    if (!requestId) return;
    const pending = this.pendingRequests.get(requestId);
    if (!pending) return;

    if (!pending.responded) {
      pending.responded = true;
      this.write(createJsonRpcSuccessResponse(pending.id, this.withExternalRequestIdentity(result, requestId)));
      if (!pending.allowAdditionalResult || result.type !== AgentRuntimeResultType.CollaborationResult) {
        this.pendingRequests.delete(requestId);
      }
      return;
    }

    this.write(
      createRuntimeNotification("runtime/result", {
        ...this.withExternalRequestIdentity(result, requestId),
        rpcRequestId: pending.id,
      }),
    );
    this.pendingRequests.delete(requestId);
  }

  writeError(error: unknown) {
    if (this.handlingCommand && !this.activeRequestId) {
      return;
    }
    const protocolError =
      error instanceof JsonRpcProtocolError
        ? error
        : new JsonRpcProtocolError(-32603, error instanceof Error ? error.message : String(error));
    if (!protocolError.shouldRespond) {
      return;
    }
    const activeRequest = this.activeRequestId ? this.pendingRequests.get(this.activeRequestId) : null;
    if (this.activeRequestId) {
      this.pendingRequests.delete(this.activeRequestId);
    }
    this.write(
      createJsonRpcErrorResponse(
        activeRequest?.id ?? protocolError.id,
        protocolError.code,
        protocolError.message,
        protocolError.data,
      ),
    );
  }

  private withExternalRequestIdentity<TValue>(value: TValue, knownRequestId?: string): TValue {
    if (!value || typeof value !== "object" || Array.isArray(value) || !("taskId" in value)) return value;
    const taskId = (value as { taskId?: unknown }).taskId;
    if (typeof taskId !== "string") return value;
    const internalRequestId = knownRequestId ?? taskId;
    const pending = this.pendingRequests.get(internalRequestId);
    if (!pending || taskId !== internalRequestId) return value;
    return {
      ...value,
      taskId: String(pending.id),
    };
  }
}

export const parseAgentRuntimeCommand = (line: string): AgentRuntimeCommand =>
  new AgentRuntimeStdioProtocol(() => undefined).parseCommand(line);
