import type { RuntimeModelOption } from "@/features/pages/settings/llm/store";

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
