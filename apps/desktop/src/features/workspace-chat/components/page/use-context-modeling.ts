import { useCallback, useMemo } from "react";
import {
  toAgentRuntimeModelConfig,
} from "@/ai/agent-runtime/config";
import type { AgentRuntimeModelConfig } from "@/ai/agent-runtime/contracts";
import {
  formatConversationForSummary,
  resolveAppContextWindow,
  type ConversationSummarizer,
} from "@/ai/agent-context";
import type { LlmProvider, ProviderModel } from "@/ai/llm/types";
import { runSharedRuntimeChat } from "@/features/shared-chat-runtime";
import type { ContextWindowPreset } from "../../page-types";
import { createMessageId } from "../../utils/sessions";

type UseContextModelingInput = {
  contextWindowPreset: ContextWindowPreset;
  runtimeAgentRequiresModel: boolean;
  effectiveProvider?: LlmProvider | null;
  effectiveModel?: ProviderModel | null;
};

export const useContextModeling = ({
  contextWindowPreset,
  runtimeAgentRequiresModel,
  effectiveProvider,
  effectiveModel,
}: UseContextModelingInput) => {
  const runtimeModelFor = useCallback((
    provider: LlmProvider,
    model: ProviderModel,
  ): AgentRuntimeModelConfig => toAgentRuntimeModelConfig(provider, model), []);

  const contextModelFor = useCallback((
    provider?: LlmProvider | null,
    model?: ProviderModel | null,
  ) => {
    const runtimeModel = provider && model ? runtimeModelFor(provider, model) : null;
    const contextWindow = resolveAppContextWindow(contextWindowPreset, runtimeModel);

    return runtimeModel
      ? { ...runtimeModel, contextWindow }
      : { contextWindow };
  }, [contextWindowPreset, runtimeModelFor]);

  const effectiveAppContextWindow = useMemo(
    () => contextModelFor(effectiveProvider, effectiveModel).contextWindow,
    [contextModelFor, effectiveModel, effectiveProvider],
  );

  const summarizerFor = useCallback((
    provider?: LlmProvider | null,
    model?: ProviderModel | null,
  ): ConversationSummarizer | null => {
    if (!runtimeAgentRequiresModel || !provider || !model) {
      return null;
    }

    return async ({ previousSummary, messages }) => {
      if (messages.length === 0) {
        return previousSummary;
      }

      const result = await runSharedRuntimeChat({
        provider,
        model,
        stream: false,
        systemPrompt: [
          "你是聊天历史压缩器。请把跨任务恢复所需的信息压缩成中文摘要。",
          "要求：保留用户目标、已确认的决策、关键约束、文件/路径/实体名、未完成事项、助手已经给出的重要结论。",
          "不要添加新事实，不要回答用户问题，不要输出寒暄。",
          "输出适合继续追加滚动摘要的纯文本，尽量精炼。",
        ].join("\n"),
        messages: [{
          id: createMessageId(),
          role: "user",
          content: [
            previousSummary ? `已有摘要：\n${previousSummary}` : "已有摘要：无",
            "",
            "需要并入摘要的新对话：",
            formatConversationForSummary(messages),
          ].join("\n"),
          timestamp: Date.now(),
        }],
      });

      return result.text.trim() || previousSummary;
    };
  }, [runtimeAgentRequiresModel]);

  return {
    runtimeModelFor,
    contextModelFor,
    effectiveAppContextWindow,
    summarizerFor,
  };
};
