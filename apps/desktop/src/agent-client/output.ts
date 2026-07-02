import type { AgentClientOutputEvent } from "./contracts/events";

export type AgentClientOutputHandlers = {
  onTextDelta?: (delta: string) => void;
  onThinkingDelta?: (delta: string) => void;
};

export type AgentClientOutputState = {
  text: string;
  thinking: string;
};

export type AgentClientOutputSnapshot = {
  text: string;
  thinking?: string;
};

export const createAgentClientOutputState = (): AgentClientOutputState => ({
  text: "",
  thinking: "",
});

export const isAgentClientOutputEvent = (event: { type: string }): event is AgentClientOutputEvent =>
  event.type === "text_delta" ||
  event.type === "thinking_delta" ||
  event.type === "replace_text" ||
  event.type === "thinking_end" ||
  event.type === "done";

export const applyAgentClientOutputEvent = (state: AgentClientOutputState, event: AgentClientOutputEvent) => {
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

export const dispatchAgentClientOutputEvent = (event: AgentClientOutputEvent, handlers: AgentClientOutputHandlers) => {
  if (event.type === "text_delta") {
    handlers.onTextDelta?.(event.delta);
    return;
  }

  if (event.type === "thinking_delta") {
    handlers.onThinkingDelta?.(event.delta);
  }
};

export const snapshotAgentClientOutput = (state: AgentClientOutputState): AgentClientOutputSnapshot => ({
  text: state.text.trim(),
  thinking: state.thinking.trim() || undefined,
});
