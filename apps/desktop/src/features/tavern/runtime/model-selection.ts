import type { LlmProvider, ProviderModel } from "@/ai/llm/types";
import type {
  TavernCharacter,
  TavernCharacterModelConfig,
  TavernRoom,
} from "../types";

export type TavernResolvedCharacterModel = {
  provider: LlmProvider;
  model: ProviderModel;
  source: "character" | "room" | "global";
};

export type TavernReplyModel = Pick<TavernResolvedCharacterModel, "provider" | "model">;

export const resolveTavernCharacterModel = ({
  character,
  room,
  providers,
  fallbackProvider,
  fallbackModel,
}: {
  character: TavernCharacter;
  room?: TavernRoom | null;
  providers: LlmProvider[];
  fallbackProvider: LlmProvider | null;
  fallbackModel: ProviderModel | null;
}): TavernResolvedCharacterModel | null => {
  const resolveConfiguredModel = (
    config: TavernCharacterModelConfig | undefined,
  ) => {
    const configuredProvider = config?.providerId
      ? providers.find((provider) => provider.id === config.providerId)
      : null;
    const configuredModel = configuredProvider && config?.modelId
      ? configuredProvider.models.find((model) =>
          model.id === config.modelId && model.isEnabled
        )
      : null;

    return configuredProvider && configuredModel
      ? { provider: configuredProvider, model: configuredModel }
      : null;
  };

  const characterModel = resolveConfiguredModel(
    room?.characterConfigs?.[character.id]?.modelConfig,
  );
  if (characterModel) {
    return {
      ...characterModel,
      source: "character",
    };
  }

  const roomModel = resolveConfiguredModel(room?.modelConfig);
  if (roomModel) {
    return {
      ...roomModel,
      source: "room",
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
  ? `${resolvedModel.model.modelName}${
      resolvedModel.source === "character"
        ? "（角色自定义）"
        : resolvedModel.source === "room"
          ? "（跟随酒馆）"
          : "（系统默认）"
    }`
  : "未选择模型";
