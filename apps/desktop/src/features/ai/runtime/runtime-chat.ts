import {
  applyAgentRuntimeOutputEvent,
  createAgentRuntimeOutputState,
  dispatchAgentRuntimeOutputEvent,
  snapshotAgentRuntimeOutput,
} from "@/ai/agent-runtime/output";
import { createAgentRuntime } from "@/ai/agent-runtime/runtime";
import type { RuntimeModelInput } from "@/ai/runtime-protocol";
import type { ConversationMessage } from "./conversation";

const sharedAgentRuntime = createAgentRuntime();

export type RunSharedRuntimeChatInput = {
  agentId?: string;
  workspacePath?: string | null;
  sessionRootDir?: string | null;
  runtimeModel?: RuntimeModelInput | null;
  systemPrompt: string;
  userMessage?: string | null;
  requestContext?: string | null;
  runtimeInstruction?: string | null;
  messages?: ConversationMessage[];
  stream?: boolean;
  onTextDelta?: (delta: string) => void;
  onThinkingDelta?: (delta: string) => void;
};

export type RunSharedRuntimeChatOutput = {
  text: string;
  thinking?: string | null;
  bridgeSession?: {
    sessionRootDir: string;
    userMessageRecordId?: string | null;
    requestContextRecordId?: string | null;
    runtimeInstructionRecordId?: string | null;
    assistantMessageRecordId?: string | null;
  } | null;
};

const latestUserMessageContent = (messages: ConversationMessage[] | undefined) => {
  for (const message of (messages ?? []).slice().reverse()) {
    if (message.role === "user" && message.content.trim()) {
      return message.content.trim();
    }
  }
  return "";
};

export async function runSharedRuntimeChat(
  input: RunSharedRuntimeChatInput,
): Promise<RunSharedRuntimeChatOutput> {
  const output = createAgentRuntimeOutputState();
  const onTextDelta = input.onTextDelta
    ? (delta: string) => {
      const event = { type: "text_delta" as const, delta };
      applyAgentRuntimeOutputEvent(output, event);
      dispatchAgentRuntimeOutputEvent(event, input);
    }
    : undefined;
  const onThinkingDelta = input.onThinkingDelta
    ? (delta: string) => {
      const event = { type: "thinking_delta" as const, delta };
      applyAgentRuntimeOutputEvent(output, event);
      dispatchAgentRuntimeOutputEvent(event, input);
    }
    : undefined;

  const result = await sharedAgentRuntime.run({
    type: "chat",
    agentId: input.agentId,
    workspacePath: input.workspacePath,
    sessionRootDir: input.sessionRootDir,
    runtimeModel: input.runtimeModel,
    systemPrompt: input.systemPrompt,
    userMessage: input.userMessage ?? latestUserMessageContent(input.messages),
    requestContext: input.requestContext,
    runtimeInstruction: input.runtimeInstruction,
    messages: input.messages,
    stream: input.stream ?? true,
    onTextDelta,
    onThinkingDelta,
  });
  applyAgentRuntimeOutputEvent(output, {
    type: "done",
    text: result.text,
  });
  if (result.thinking?.trim()) {
    applyAgentRuntimeOutputEvent(output, {
      type: "thinking_end",
      content: result.thinking,
    });
  }

  return {
    ...snapshotAgentRuntimeOutput(output),
    bridgeSession: result.bridgeSession ?? null,
  };
}
