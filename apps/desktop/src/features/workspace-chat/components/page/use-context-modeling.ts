import { useCallback, useMemo } from "react";
import {
  toAgentRuntimeModelInput,
} from "@/ai/agent-runtime/config";
import type { AgentRuntimeModelInput } from "@/ai/agent-runtime/contracts";
import {
  resolveAppContextWindow,
  type ConversationSummarizer,
} from "@/ai/agent-context";
import type { LlmProvider, ProviderModel } from "@/ai/llm/types";
import { createSharedConversationSummarizer } from "@/features/shared-chat-runtime";

type UseContextModelingInput = {
  runtimeAgentRequiresModel: boolean;
  effectiveProvider?: LlmProvider | null;
  effectiveModel?: ProviderModel | null;
};

export const useContextModeling = ({
  runtimeAgentRequiresModel,
  effectiveProvider,
  effectiveModel,
}: UseContextModelingInput) => {
  const modelInputFor = useCallback((
    provider: LlmProvider,
    model: ProviderModel,
  ): AgentRuntimeModelInput => toAgentRuntimeModelInput(provider, model), []);

  const contextModelFor = useCallback((
    provider?: LlmProvider | null,
    model?: ProviderModel | null,
  ) => {
    const modelInput = provider && model ? modelInputFor(provider, model) : null;
    const contextWindow = resolveAppContextWindow(modelInput);

    return modelInput
      ? { ...modelInput, contextWindow }
      : { contextWindow };
  }, [modelInputFor]);

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

    return createSharedConversationSummarizer({
      provider,
      model,
      systemPrompt: [
        "你是聊天历史压缩器。请把跨任务恢复所需的信息压缩成中文摘要。",
        "要求：保留用户目标、已确认的决策、关键约束、文件/路径/实体名、未完成事项、助手已经给出的重要结论。",
        "不要添加新事实，不要回答用户问题，不要输出寒暄。",
        "输出适合继续追加滚动摘要的纯文本，尽量精炼。",
      ].join("\n"),
    });
  }, [runtimeAgentRequiresModel]);

  return {
    modelInputFor,
    contextModelFor,
    effectiveAppContextWindow,
    summarizerFor,
  };
};
