import type { AgentClientOutputEvent } from "./contracts";
import { agentRuntimeEventGuards } from "./wire";

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
  agentRuntimeEventGuards.textDelta(event) ||
  agentRuntimeEventGuards.thinkingDelta(event) ||
  agentRuntimeEventGuards.replaceText(event) ||
  agentRuntimeEventGuards.thinkingEnd(event) ||
  agentRuntimeEventGuards.done(event);

export const applyAgentClientOutputEvent = (state: AgentClientOutputState, event: AgentClientOutputEvent) => {
  if (agentRuntimeEventGuards.textDelta(event)) {
    state.text += event.delta;
    return;
  }

  if (agentRuntimeEventGuards.replaceText(event)) {
    state.text = event.text;
    return;
  }

  if (agentRuntimeEventGuards.thinkingDelta(event)) {
    state.thinking += event.delta;
    return;
  }

  if (agentRuntimeEventGuards.thinkingEnd(event)) {
    state.thinking = event.content || state.thinking;
    return;
  }

  if (agentRuntimeEventGuards.done(event)) {
    state.text = event.text || state.text;
  }
};

export const dispatchAgentClientOutputEvent = (event: AgentClientOutputEvent, handlers: AgentClientOutputHandlers) => {
  if (agentRuntimeEventGuards.textDelta(event)) {
    handlers.onTextDelta?.(event.delta);
    return;
  }

  if (agentRuntimeEventGuards.thinkingDelta(event)) {
    handlers.onThinkingDelta?.(event.delta);
  }
};

export const snapshotAgentClientOutput = (state: AgentClientOutputState): AgentClientOutputSnapshot => ({
  text: state.text.trim(),
  thinking: state.thinking.trim() || undefined,
});
