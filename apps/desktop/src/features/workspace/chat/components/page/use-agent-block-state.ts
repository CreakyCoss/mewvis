import { useCallback, useEffect, useRef, useState } from "react";
import { AGENT_BLOCK_AUTO_COLLAPSE_DELAY_MS } from "../../utils/agent-blocks";
import type { ChatMessage } from "../../types";

type UseAgentBlockStateInput = {
  messages: ChatMessage[];
  updateMessage: (
    messageId: string,
    updater: (message: ChatMessage) => ChatMessage,
  ) => void;
};

export const useAgentBlockState = ({
  messages,
  updateMessage,
}: UseAgentBlockStateInput) => {
  const agentBlockCollapseTimersRef = useRef<Map<string, number>>(new Map());
  const [expandedThinkingIds, setExpandedThinkingIds] = useState<Set<string>>(() => new Set());
  const [expandedAgentEventIds, setExpandedAgentEventIds] = useState<Set<string>>(() => new Set());

  const clearExpandedAgentBlocks = useCallback(() => {
    setExpandedThinkingIds(new Set());
    setExpandedAgentEventIds(new Set());
  }, []);

  const toggleThinking = useCallback((messageId: string) => {
    setExpandedThinkingIds((current) => {
      const next = new Set(current);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  }, []);

  const toggleAgentThinkingBlock = useCallback((messageId: string, blockId: string) => {
    updateMessage(messageId, (message) => ({
      ...message,
      agentBlocks: message.agentBlocks?.map((block) =>
        block.id === blockId && block.type === "thinking"
          ? { ...block, isCollapsed: !block.isCollapsed }
          : block,
      ),
    }));
  }, [updateMessage]);

  const toggleAgentBlock = useCallback((messageId: string, blockId: string) => {
    updateMessage(messageId, (message) => ({
      ...message,
      agentBlocks: message.agentBlocks?.map((block) =>
        block.id === blockId && (block.type === "thinking" || block.type === "tool")
          ? { ...block, isCollapsed: !block.isCollapsed }
          : block,
      ),
    }));
  }, [updateMessage]);

  const collapseAgentBlock = useCallback((messageId: string, blockId: string) => {
    updateMessage(messageId, (message) => ({
      ...message,
      agentBlocks: message.agentBlocks?.map((block) =>
        block.id === blockId && (block.type === "thinking" || block.type === "tool")
          ? { ...block, isCollapsed: true }
          : block,
      ),
    }));
  }, [updateMessage]);

  const scheduleAgentBlockCollapse = useCallback((messageId: string, blockId: string) => {
    const timerKey = `${messageId}:${blockId}`;
    const existingTimer = agentBlockCollapseTimersRef.current.get(timerKey);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }

    const timer = window.setTimeout(() => {
      agentBlockCollapseTimersRef.current.delete(timerKey);
      collapseAgentBlock(messageId, blockId);
    }, AGENT_BLOCK_AUTO_COLLAPSE_DELAY_MS);
    agentBlockCollapseTimersRef.current.set(timerKey, timer);
  }, [collapseAgentBlock]);

  const toggleAgentEvents = useCallback((messageId: string) => {
    setExpandedAgentEventIds((current) => {
      const next = new Set(current);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    messages.forEach((message) => {
      if (message.role !== "assistant" || message.mode !== "agent") {
        return;
      }

      message.agentBlocks?.forEach((block) => {
        if (block.type === "tool" && block.status === "done" && !block.isCollapsed) {
          scheduleAgentBlockCollapse(message.id, block.id);
        }
      });
    });
  }, [messages, scheduleAgentBlockCollapse]);

  useEffect(() => () => {
    agentBlockCollapseTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    agentBlockCollapseTimersRef.current.clear();
  }, []);

  return {
    expandedThinkingIds,
    expandedAgentEventIds,
    clearExpandedAgentBlocks,
    toggleThinking,
    toggleAgentEvents,
    toggleAgentThinkingBlock,
    toggleAgentBlock,
    scheduleAgentBlockCollapse,
  };
};
