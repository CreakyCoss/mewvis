import {
  TAVERN_PROMPT_STYLE_PRESETS,
  normalizeTavernPromptStyleId,
} from "../../../prompt-styles";
import {
  TAVERN_PRESENTATION_PROFILES,
  normalizeTavernPresentationProfileId,
} from "../../../prompt-registry/presentation-rules";
import {
  TAVERN_SYSTEM_NARRATIVE_PRESETS,
  normalizeTavernSystemNarrativePresetId,
} from "../../../prompt-registry/system-narrative-styles";
import {
  normalizeTavernQualityRuleIds,
  normalizeTavernRuleCompositionId,
  resolveTavernPromptRuleStack,
} from "../../../prompt-registry/rule-layers/resolver";
import type { TavernGeneratedPresetAgentDraft } from "../generated-preset-agent";
import {
  generatedPresetSchema,
  promptStyleOptionsText,
} from "./schema";

export const buildTavernGeneratedPresetAgentSystemPrompt = () => [
  "你是酒馆预设生成 agent，负责把用户的简短想法整理成应用可直接导入的标准 JSON。",
  "必须只输出一个 JSON 对象，不要输出 markdown、解释、注释或额外文本。",
  "所有角色都是 agent 角色，不是 chat 角色；不要设计让角色替用户说话或行动的规则。",
  "角色只根据自己视角和已知信息反应；可写小说化动作、神态、环境描写，但必须属于当前角色或公开环境。",
  "人设优先，不能随意补设定导致漂移；世界书只写稳定设定，不写本轮临时动作。",
  "必须尊重 request_context 中已填的 title、premise、background、worldInfo、storyGoal、characterSeeds、promptStyleId、promptSeed 和 presentationProfileId，不要覆盖用户明确设定。",
  "room.presentation.profileId 必须等于 request_context.presentationProfileId。对话演绎使用直接对白；第三人称旁白使用间接表达和动作心理转述；小说正文允许少量自然对白但不要输出聊天记录格式。",
  "提示词预设只作为 request_context.promptSeed 给应用生成初始可编辑文本块；不要把系统叙事、酒馆风格或写作组合写进 room.settings。",
  "如果 request_context.advanced.characterCount 存在，characters 数量应尽量等于该数；如果用户给了角色线索，优先保留这些角色。",
  "room.settings.replyOptions 默认启用，count 默认为 3；候选回复内容由运行时生成，预设 JSON 不要提前写死候选回复。",
  "如果 request_context.advanced.enableStatusTracking 为 false，room.settings.statusTracking.enabled 必须为 false，statusDefinitions/statusRules/progressViews 可以为空数组。",
  "如果 request_context.advanced.enableStatusTracking 为 true，可以生成少量通用状态面板，但每个可变数值状态都必须有明确事件驱动的 statusRules。",
  "如果 request_context.advanced.enableIllustrationHints 为 false，room.settings.illustrationHints.enabled 必须为 false；为 true 时只开启配置，不要生成与当前公开场景矛盾的插图内容。",
  "如果 request_context.advanced.enableRandomEvents 为 false，room.settings.randomEvents.enabled 必须为 false；为 true 时使用 request_context.advanced.randomEventProbability，随机事件仍只由导演运行时决定。",
  "room.settings.directorNarrativeControl 是应用操作策略，不是提示词风格：普通互动使用 balanced/visible/auto；强剧情网文可提高 narratorPressure、eventInterruption、mainHook 和 qnaBreak；阶段制投票或严格问答可降低或关闭。",
  "狼人杀、推理悬疑或阵营剧本必须设置 room.settings.informationPolicy：公共聊天只显示 public，用户私密情报用 visibleToUser 事实表达，角色/阵营私密事实用 visibleToCharacterIds/visibleToFactionIds 表达；需要每局随机身份时，填写 roleAssignment.rolePool，由导演运行时生成本局身份事实；若进入房间就应开局，设置 roleAssignment.opening.autoStart，并用 opening.publicEventType/publicEventValue/globalStatusPatches 声明分配后要产生的公开事件和状态变化。",
  "狼人杀、辩论投票、回合制推理等阶段制剧本应设置 room.settings.directorScheduling：夜晚/投票/结算阶段可 allowDirectorOnly，白天发言阶段用 fixedOrder 绑定全局阶段状态并禁用自动续调度，避免被点名角色同轮插队；若用户也在固定座次中，设置 fixedOrder.includeUser 和 userPosition。",
  "普通互动剧本的 targetedReplyPolicy 优先使用 prefer：被点名者应被导演优先考虑；如果需要回应但不适合开口，应进入 nonverbalReplyIds，由角色 Agent 输出心理和动作，直接对白可为空。只有完全无需近景反应时才用 ambientActions/旁白处理；只有确实要求目标必须开口时才用 include/exclusive。",
  "room.settings.directorScheduling.profile 是稳定调度画像，不写本轮临时状态；为每个角色填写 speechBias、interestTags、goalTags、speechTriggers、silenceTriggers 等，让导演后续每轮结合动态状态和事实计算发言动机。",
  "profile 只描述低频稳定特征，例如沉默寡言、对化学知识感兴趣、目标是获得用户信任；不要把当前血量、当前好感、刚发生的动作写进 profile，这些应由状态栏、任务、事实和每轮调度信号处理。",
  "仅部分人可知的事实不能写进开场旁白或公开消息；只能写入 factEvents/status 初始数据或角色私有记忆，并设置可见性。",
  "随机事件只由导演触发，必须是公开可观察事件，不能直接解决主线，不能覆盖用户选择。",
  "状态栏、任务和结局可为空数组；如果设计数值状态，必须同时给出可由明确事件驱动的 statusRules。",
  "可选状态应优先使用 health、san、favorability、hostility、scene_phase、threat_level 这类通用字段。",
  "可选任务应明确 owner、visibility、completeCondition/failCondition，个人任务和团队任务都要与状态或事实事件一致。",
  "",
  "<prompt_style_options>",
  promptStyleOptionsText(),
  "</prompt_style_options>",
  "",
  "<json_schema>",
  generatedPresetSchema,
  "</json_schema>",
].join("\n");

export const buildTavernGeneratedPresetRequestContext = (
  draft: TavernGeneratedPresetAgentDraft,
) => {
  const promptStyleId = normalizeTavernPromptStyleId(draft.promptStyleId);
  const presentationProfileId = normalizeTavernPresentationProfileId(draft.presentationProfileId);
  const systemNarrativePresetId = normalizeTavernSystemNarrativePresetId(
    draft.promptSeed?.systemNarrativePresetId,
  );
  const platformStyleId = normalizeTavernRuleCompositionId(
    draft.promptSeed?.ruleCompositionId,
  );
  const qualityRuleIds = normalizeTavernQualityRuleIds(
    draft.promptSeed?.qualityRuleIds,
  );
  const ruleStack = resolveTavernPromptRuleStack({
    compositionId: platformStyleId,
    qualityRuleIds,
  });
  return JSON.stringify({
    ...draft,
    promptStyleId,
    promptSeed: {
      ...draft.promptSeed,
      systemNarrativePresetId,
      ruleCompositionId: platformStyleId,
      qualityRuleIds,
    },
    presentationProfileId,
    promptStyle: TAVERN_PROMPT_STYLE_PRESETS.find((preset) => preset.id === promptStyleId),
    presentationProfile: TAVERN_PRESENTATION_PROFILES.find((profile) =>
      profile.id === presentationProfileId
    ),
    ruleComposition: ruleStack.composition,
    platformStyle: ruleStack.platformStyle,
    ruleGroups: ruleStack.ruleGroups,
    systemNarrativePreset: TAVERN_SYSTEM_NARRATIVE_PRESETS.find((preset) =>
      preset.id === systemNarrativePresetId
    ),
  }, null, 2);
};
