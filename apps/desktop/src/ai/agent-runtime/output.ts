import type { AgentRuntimeOutputEvent } from "./contracts";

export type AgentRuntimeOutputHandlers = {
  onTextDelta?: (delta: string) => void;
  onThinkingDelta?: (delta: string) => void;
};

export type AgentRuntimeOutputState = {
  text: string;
  thinking: string;
};

export type AgentRuntimeOutputSnapshot = {
  text: string;
  thinking?: string;
};

export const createAgentRuntimeOutputState = (): AgentRuntimeOutputState => ({
  text: "",
  thinking: "",
});

export const isAgentRuntimeOutputEvent = (
  event: { type: string },
): event is AgentRuntimeOutputEvent => (
  event.type === "text_delta" ||
  event.type === "thinking_delta" ||
  event.type === "replace_text" ||
  event.type === "thinking_end" ||
  event.type === "done"
);

export const applyAgentRuntimeOutputEvent = (
  state: AgentRuntimeOutputState,
  event: AgentRuntimeOutputEvent,
) => {
  if (event.type === "text_delta") {
    state.text += event.delta;
    return;
  }

  if (event.type === "replace_text") {
    state.text = event.text;
    return;
  }

  if (event.type === "thinking_delta") {
    state.thinking += event.delta;
    return;
  }

  if (event.type === "thinking_end") {
    state.thinking = event.content || state.thinking;
    return;
  }

  if (event.type === "done") {
    state.text = event.text || state.text;
  }
};

export const dispatchAgentRuntimeOutputEvent = (
  event: AgentRuntimeOutputEvent,
  handlers: AgentRuntimeOutputHandlers,
) => {
  if (event.type === "text_delta") {
    handlers.onTextDelta?.(event.delta);
    return;
  }

  if (event.type === "thinking_delta") {
    handlers.onThinkingDelta?.(event.delta);
  }
};

export const snapshotAgentRuntimeOutput = (
  state: AgentRuntimeOutputState,
): AgentRuntimeOutputSnapshot => ({
  text: state.text.trim(),
  thinking: state.thinking.trim() || undefined,
});
