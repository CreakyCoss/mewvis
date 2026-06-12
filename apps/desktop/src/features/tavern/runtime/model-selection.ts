import type { RuntimeModelOption } from "@/features/llm-settings/runtime-models";
import type {
  TavernCharacter,
  TavernCharacterModelConfig,
  TavernRoom,
} from "../types";

export type TavernResolvedCharacterModel = {
  runtimeModel: RuntimeModelOption;
  source: "character" | "room" | "global";
};

export type TavernReplyModel = Pick<TavernResolvedCharacterModel, "runtimeModel">;

export const resolveTavernCharacterModel = ({
  character,
  room,
  runtimeModels,
  fallbackRuntimeModel,
}: {
  character: TavernCharacter;
  room?: TavernRoom | null;
  runtimeModels: RuntimeModelOption[];
  fallbackRuntimeModel: RuntimeModelOption | null;
}): TavernResolvedCharacterModel | null => {
  const resolveConfiguredModel = (
    config: TavernCharacterModelConfig | undefined,
  ) => {
    const runtimeModel = config?.providerId && config?.modelId
      ? runtimeModels.find((model) =>
          model.provider.id === config.providerId &&
          model.modelId === config.modelId
        )
      : null;

    return runtimeModel
      ? { runtimeModel }
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

  return fallbackRuntimeModel
    ? {
        runtimeModel: fallbackRuntimeModel,
        source: "global",
      }
    : null;
};

export const formatTavernResolvedModelLabel = (
  resolvedModel: TavernResolvedCharacterModel | null,
) => resolvedModel
  ? `${resolvedModel.runtimeModel.modelName}${
      resolvedModel.source === "character"
        ? "（角色自定义）"
        : resolvedModel.source === "room"
          ? "（跟随酒馆）"
          : "（系统默认）"
    }`
  : "未选择模型";
