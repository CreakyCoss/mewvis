import type { LlmProvider, ProviderModel } from "@/ai/llm/types";
import type { TavernCharacter } from "../types";

export type TavernResolvedCharacterModel = {
  provider: LlmProvider;
  model: ProviderModel;
  source: "character" | "global";
};

export type TavernReplyModel = Pick<TavernResolvedCharacterModel, "provider" | "model">;

export const resolveTavernCharacterModel = ({
  character,
  providers,
  fallbackProvider,
  fallbackModel,
}: {
  character: TavernCharacter;
  providers: LlmProvider[];
  fallbackProvider: LlmProvider | null;
  fallbackModel: ProviderModel | null;
}): TavernResolvedCharacterModel | null => {
  const configuredProvider = character.modelConfig?.providerId
    ? providers.find((provider) => provider.id === character.modelConfig?.providerId)
    : null;
  const configuredModel = configuredProvider && character.modelConfig?.modelId
    ? configuredProvider.models.find((model) =>
        model.id === character.modelConfig?.modelId && model.isEnabled
      )
    : null;

  if (configuredProvider && configuredModel) {
    return {
      provider: configuredProvider,
      model: configuredModel,
      source: "character",
    };
  }

  return fallbackProvider && fallbackModel
    ? {
        provider: fallbackProvider,
        model: fallbackModel,
        source: "global",
      }
    : null;
};

export const formatTavernResolvedModelLabel = (
  resolvedModel: TavernResolvedCharacterModel | null,
) => resolvedModel
  ? `${resolvedModel.model.modelName}${resolvedModel.source === "character" ? "" : "（默认）"}`
  : "未选择模型";
