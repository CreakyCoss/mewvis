import type {
  TavernPromptBlock,
  TavernScenePromptOverrides,
} from "./types";

const normalizePromptBlockTarget = (value: unknown): TavernPromptBlock["target"] | null => {
  if (value === "bridge" || value === "director" || value === "character") {
    return value;
  }
  return null;
};

export const normalizeScenePromptOverrides = (
  input: Partial<TavernScenePromptOverrides> = {},
): TavernScenePromptOverrides => ({
  version: 1,
  blocks: Array.isArray(input.blocks)
    ? input.blocks.flatMap((block, index) => {
        if (!block || typeof block !== "object") {
          return [];
        }

        const candidate = block as Partial<TavernPromptBlock>;
        const target = normalizePromptBlockTarget(candidate.target);
        const text = typeof candidate.text === "string" ? candidate.text.trim() : "";
        if (!target || !text) {
          return [];
        }

        const label = typeof candidate.label === "string" && candidate.label.trim()
          ? candidate.label.trim()
          : "节点风格补充";
        const id = typeof candidate.id === "string" && candidate.id.trim()
          ? candidate.id.trim()
          : `node-prompt:${target}:${index + 1}`;
        const order = typeof candidate.order === "number" && Number.isFinite(candidate.order)
          ? candidate.order
          : 9000 + index;

        return [{
          id,
          target,
          label,
          text,
          enabled: candidate.enabled !== false,
          order,
          source: {
            type: "custom",
            id: "node-prompt-override",
            label: "节点风格补充",
          },
        } satisfies TavernPromptBlock];
      })
      .sort((left, right) => left.order - right.order || left.label.localeCompare(right.label))
    : [],
});
