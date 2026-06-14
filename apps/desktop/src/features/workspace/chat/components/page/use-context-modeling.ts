import { useCallback, useMemo } from "react";
import {
  agentContext,
  type ConversationSummarizer,
} from "@/ai/agent-context";
import { createSharedConversationSummarizer } from "@/features/ai/runtime";
import {
  resolveRuntimeModelInput,
  type RuntimeModelOption,
} from "@/features/ai/llm/store";

const {
  resolveAppContextWindow,
} = agentContext;

type UseContextModelingInput = {
  runtimeAgentRequiresModel: boolean;
  effectiveRuntimeModel?: RuntimeModelOption | null;
};

export const useContextModeling = ({
  runtimeAgentRequiresModel,
  effectiveRuntimeModel,
}: UseContextModelingInput) => {
  const contextModelFor = useCallback((
    runtimeModel?: RuntimeModelOption | null,
  ) => {
    const modelInput = runtimeModel
      ? resolveRuntimeModelInput(runtimeModel.id)
      : null;
    const contextWindow = resolveAppContextWindow(modelInput);

    return modelInput
      ? { ...modelInput, contextWindow }
      : { contextWindow };
  }, []);

  const effectiveAppContextWindow = useMemo(
    () => contextModelFor(effectiveRuntimeModel).contextWindow,
    [contextModelFor, effectiveRuntimeModel],
  );

  const summarizerFor = useCallback((
    runtimeModel?: RuntimeModelOption | null,
  ): ConversationSummarizer | null => {
    if (!runtimeAgentRequiresModel || !runtimeModel) {
      return null;
    }
    const modelInput = resolveRuntimeModelInput(runtimeModel.id);
    if (!modelInput) {
      return null;
    }

    return createSharedConversationSummarizer({
      runtimeModel: modelInput,
      systemPrompt: [
        "你是聊天历史压缩器。请把跨任务恢复所需的信息压缩成中文摘要。",
        "要求：保留用户目标、已确认的决策、关键约束、文件/路径/实体名、未完成事项、助手已经给出的重要结论。",
        "不要添加新事实，不要回答用户问题，不要输出寒暄。",
        "输出适合继续追加滚动摘要的纯文本，尽量精炼。",
      ].join("\n"),
    });
  }, [runtimeAgentRequiresModel]);

  return {
    contextModelFor,
    effectiveAppContextWindow,
    summarizerFor,
  };
};
