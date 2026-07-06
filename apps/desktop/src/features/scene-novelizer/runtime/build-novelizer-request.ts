import type { SceneNovelSource } from "../types";
import { getSceneNovelizerPlatformPackage } from "../prompt-registry/packages";
import { getSceneNovelizerRuleOptions, SCENE_NOVELIZER_RULE_CATEGORY_LABELS } from "../prompt-registry/rule-options";

const materialKindLabel: Record<string, string> = {
  user_action: "用户行动",
  dialogue: "实际话语",
  action: "动作行为",
  thought: "心理想法",
  narration: "旁白承接",
  observation: "观察线索",
  consequence: "行动后果",
  interruption: "事件打断",
  hook: "主线钩子",
};

export const buildSceneNovelizerSystemPrompt = (source: SceneNovelSource) => {
  const platformPackage = getSceneNovelizerPlatformPackage(source.platformStyleId);

  return [
    platformPackage.systemInstruction,
    "你只负责把已发生的互动素材整理成网文正文草稿，不改变酒馆 canonical history。",
    "你可以增强节奏、过渡、描写、对白衔接和章尾钩子，但必须遵守素材事实。",
    "不得改变用户行动，不得新增关键真相，不得替用户做未发生选择，不得泄露 source 中 visibility 不允许使用的私密信息。",
    "只输出正文草稿，不输出标题、解释、清单、Markdown 代码块、JSON 或提示词说明。",
  ].join("\n");
};

export const buildSceneNovelizerRequestContext = (source: SceneNovelSource, feedback?: string) => {
  const platformPackage = getSceneNovelizerPlatformPackage(source.platformStyleId);
  const ruleOptions = getSceneNovelizerRuleOptions(source.ruleOptionIds);
  const visibleMaterials = source.materials.filter(
    (material) =>
      material.text.trim() &&
      (source.constraints.thoughtMode !== "user_visible_only" ||
        material.visibility === "public" ||
        material.visibility === "user_visible"),
  );

  return [
    "<scene_novel_source>",
    `title: ${source.title}`,
    `platform: ${platformPackage.label}`,
    `sceneSummary: ${source.sceneSummary}`,
    `sceneGoal: ${source.sceneGoal}`,
    `sceneStatus: ${source.sceneStatus}`,
    `userPersonaName: ${source.userPersonaName}`,
    `targetChars: ${source.constraints.targetChars}`,
    `paragraphMaxChars: ${source.constraints.paragraphMaxChars}`,
    `thoughtMode: ${source.constraints.thoughtMode}`,
    `preserveUserActions: ${source.constraints.preserveUserActions}`,
    `noNewKeyConclusion: ${source.constraints.noNewKeyConclusion}`,
    "</scene_novel_source>",
    "",
    "<platform_rules>",
    ...platformPackage.writingRules.map((rule) => `- ${rule}`),
    "</platform_rules>",
    "",
    ruleOptions.length > 0
      ? [
          '<writing_rule_layers instruction="user_selected_realtime_writing_rules; lower_priority_than_facts_and_platform_rules">',
          ...ruleOptions.map((option) =>
            [
              `## ${SCENE_NOVELIZER_RULE_CATEGORY_LABELS[option.category]} / ${option.label}`,
              ...option.writingRules.map((rule) => `- ${rule}`),
            ].join("\n"),
          ),
          "</writing_rule_layers>",
          "",
          '<writing_rule_judge_focus instruction="local_quality_checker_focus; use_to_self_check_before_final_output">',
          ...ruleOptions.map((option) =>
            [`## ${option.label}`, ...option.judgeFocus.map((focus) => `- ${focus}`)].join("\n"),
          ),
          "</writing_rule_judge_focus>",
          "",
        ].join("\n")
      : "",
    "<confirmed_facts>",
    ...(source.confirmedFacts.length > 0 ? source.confirmedFacts.map((fact) => `- ${fact}`) : ["- 无"]),
    "</confirmed_facts>",
    "",
    "<unresolved_hooks>",
    ...(source.unresolvedHooks.length > 0 ? source.unresolvedHooks.map((hook) => `- ${hook}`) : ["- 无"]),
    "</unresolved_hooks>",
    "",
    '<materials instruction="use_as_factual_baseline; preserve_user_actions; do_not_copy_labels_into_final_text">',
    ...visibleMaterials.map((material) =>
      [
        `turn ${material.turnIndex} / ${materialKindLabel[material.kind] ?? material.kind}`,
        material.characterName ? `character: ${material.characterName}` : "",
        material.tags?.length ? `tags: ${material.tags.join(", ")}` : "",
        material.text,
      ]
        .filter(Boolean)
        .join("\n"),
    ),
    "</materials>",
    feedback ? ["", "<rewrite_feedback>", feedback, "</rewrite_feedback>"].join("\n") : "",
  ]
    .filter(Boolean)
    .join("\n");
};

export const buildSceneNovelizerRuntimeInstruction = (source: SceneNovelSource, feedback?: string) => {
  const platformPackage = getSceneNovelizerPlatformPackage(source.platformStyleId);
  const ruleOptions = getSceneNovelizerRuleOptions(source.ruleOptionIds);

  return [
    feedback ? "根据 rewrite_feedback 重写正文。" : "根据素材生成本场景小说稿。",
    `目标风格：${platformPackage.label}。`,
    ruleOptions.length > 0
      ? `已启用 ${ruleOptions.length} 个实时写作规则；这些规则用于成稿表达，不得覆盖素材事实。`
      : "",
    `目标长度约 ${source.constraints.targetChars} 字；允许上下浮动，但不能低于素材所需信息量。`,
    `段落要短，单段尽量不超过 ${source.constraints.paragraphMaxChars} 字。`,
    "保留用户行动的因果地位，把角色动作、实际话语、心理和线索织成连续正文。",
    "不要输出任何素材标签、角色冒号记录、协议 XML、裁判意见或解释。",
  ].join("\n");
};
