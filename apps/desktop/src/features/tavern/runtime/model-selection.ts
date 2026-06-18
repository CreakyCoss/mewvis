import type { RuntimeModelOption } from "@/features/ai/components/llm-setting/store";

export type TavernResolvedCharacterModel = {
  runtimeModel: RuntimeModelOption;
  source: "global";
};

export type TavernReplyModel = Pick<TavernResolvedCharacterModel, "runtimeModel">;

export const resolveTavernCharacterModel = ({
  fallbackRuntimeModel,
}: {
  fallbackRuntimeModel: RuntimeModelOption | null;
}): TavernResolvedCharacterModel | null => {
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
  ? `${resolvedModel.runtimeModel.provider.name} / ${
      resolvedModel.runtimeModel.modelName || resolvedModel.runtimeModel.modelId
    }`
  : "未选择模型";
