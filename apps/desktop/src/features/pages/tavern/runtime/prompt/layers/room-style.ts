import type { TavernPromptStylePreset } from "../../../types";
import type { TavernPromptSection } from "../shared/sections";

export const buildPromptStyleSection = ({
  promptStyle,
  target,
}: {
  promptStyle: TavernPromptStylePreset;
  target: "bridge" | "character";
}): TavernPromptSection => ({
  id: "prompt-style",
  layer: "tavern",
  tag: "prompt_style",
  attributes: target === "character"
    ? {
        id: promptStyle.id,
        label: promptStyle.label,
        target,
      }
    : {
        id: promptStyle.id,
        label: promptStyle.label,
      },
  content: target === "bridge"
    ? promptStyle.bridgeSystemAddendum
    : promptStyle.characterAddendum,
});
