import { definePlugin, defineSkill, defineTool } from "@isle/plugin-sdk";

export const name = "@isle/story-scene-card";
export const inject = ["tools", "skills"];

const storySceneCardSkill = defineSkill({
  name: "isle-story-scene-card",
  description: "把小说场景的目标、冲突、代价和转折整理成可继续写作的场景卡。",
  source: "bundled",
  content: [
    "当用户要设计、补强或检查一个小说场景时使用此能力。",
    "先提取人物在本场景中的明确目标、阻力与失败代价，再调用 `isle_story_scene_card` 固化场景卡。",
    "工具结果是写作约束，不是正文；随后再依据场景卡创作或修改正文。",
  ].join("\n"),
});

const requiredText = (args, key) => {
  const value = args?.[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} must be a non-empty string`);
  return value.trim();
};

const storySceneCardTool = defineTool({
  risk: "low",
  name: "isle_story_scene_card",
  description: "Create a compact story scene card from goal, conflict, stakes, and an optional turn.",
  parameters: {
    type: "object",
    properties: {
      goal: { type: "string", description: "The viewpoint character's immediate scene goal." },
      conflict: { type: "string", description: "The active obstacle opposing that goal." },
      stakes: { type: "string", description: "What becomes worse if the character fails." },
      turn: { type: "string", description: "Optional reversal or new information that changes the scene." },
    },
    required: ["goal", "conflict", "stakes"],
    additionalProperties: false,
  },
  output: {
    schema: {
      type: "object",
      properties: {
        goal: { type: "string" },
        conflict: { type: "string" },
        stakes: { type: "string" },
        turn: { type: "string" },
        draftingPrompt: { type: "string" },
      },
      required: ["goal", "conflict", "stakes", "turn", "draftingPrompt"],
      additionalProperties: false,
    },
    render: (_args, value) => [{ type: "text", text: JSON.stringify(value, null, 2) }],
  },
  async execute(args) {
    const goal = requiredText(args, "goal");
    const conflict = requiredText(args, "conflict");
    const stakes = requiredText(args, "stakes");
    const turn = args?.turn;
    if (turn !== undefined && typeof turn !== "string") throw new Error("turn must be a string");
    const resolvedTurn = turn?.trim() || "在场景末尾加入改变下一步行动的新信息";
    return {
      goal,
      conflict,
      stakes,
      turn: resolvedTurn,
      draftingPrompt: `让人物尝试“${goal}”，由“${conflict}”持续施压；失败将导致“${stakes}”。场景末尾：${resolvedTurn}。`,
    };
  },
});

export function apply(ctx) {
  ctx.skills.register(storySceneCardSkill);
  ctx.tools.register(storySceneCardTool);
}

export default definePlugin({ name, inject, apply });
