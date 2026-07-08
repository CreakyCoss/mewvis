import { getTavernRoomPromptOverrides, type TavernRoomRuntime } from "@/features/pages/taverns/room/model";
import { appendReferencesToPrompt } from "@/features/ai/components/context-tools";
import type { TavernMessage, TavernReferencedFile } from "@/features/pages/taverns/tavern/types";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";
import { tavernMessagesToRuntimeMessages } from "../prompt/context/history";
import {
  formatTavernStoryGraphContext,
  formatTavernStoryLorebookEntries,
  selectTavernStoryLorebookEntries,
} from "../prompt/context/story";
import { formatTavernDirectorSchedulingInstruction } from "@/features/pages/taverns/tavern/core/director-scheduling";
import { getTavernPresentationProfile } from "@/features/pages/taverns/tavern/prompt-registry/presentation-rules";
import { formatTavernPromptBlocksForTarget } from "@/features/pages/taverns/tavern/prompt-registry/text-blocks";
import { buildTavernDirectorOutputContract } from "@/features/pages/taverns/room/prompt-xml/director-output-contract";
import { buildTavernDirectorContextSections } from "./director-prompt/context-sections";

type BuildTavernDirectorPromptContextInput = {
  room: TavernRoomRuntime;
  characters: TavernCharacter[];
  messages: TavernMessage[];
  references: TavernReferencedFile[];
  currentUserText: string;
  turnTrigger: {
    type: "user" | "scene_drive";
    directive?: string;
  };
  selectedTargetCharacterIds: string[];
  maxSpeakers: number;
};

export const buildTavernDirectorPromptContext = ({
  room,
  characters,
  messages,
  references,
  currentUserText,
  turnTrigger,
  selectedTargetCharacterIds,
  maxSpeakers,
}: BuildTavernDirectorPromptContextInput) => {
  const isSceneDriveTurn = turnTrigger.type === "scene_drive";
  const sceneDriveDirective = turnTrigger.directive?.trim() || currentUserText.trim() || "继续推进当前场景。";
  const runtimeMessages = tavernMessagesToRuntimeMessages({
    messages,
    characters,
    userPersonaName: room.user.personaName,
  });
  const lorebookText = formatTavernStoryLorebookEntries(
    selectTavernStoryLorebookEntries({
      runtime: room,
      characters,
      currentUserText,
    }),
  );
  const storyGraphText = formatTavernStoryGraphContext(room);
  const ambientActionMax = Math.min(2, Math.max(0, characters.length - 1));
  const presentationProfile = getTavernPresentationProfile(room.presentation.profile?.profileId);
  const activePromptOverrides = getTavernRoomPromptOverrides(room);
  const promptBlocksText = [
    formatTavernPromptBlocksForTarget({
      prompt: room.presentation.prompt,
      target: "director",
    }),
    formatTavernPromptBlocksForTarget({
      prompt: activePromptOverrides,
      target: "director",
    }),
  ]
    .filter(Boolean)
    .join("\n\n");
  const schedulingInstruction = formatTavernDirectorSchedulingInstruction(room.presentation.settings);
  const directorPrompt = [
    buildTavernDirectorOutputContract({
      maxSpeakers,
      ambientActionMax,
      isSceneDriveTurn,
      schedulingInstruction,
    }),
    "",
    buildTavernDirectorContextSections({
      room,
      characters,
      messages,
      currentUserText,
      isSceneDriveTurn,
      sceneDriveDirective,
      runtimeMessages,
      lorebookText,
      storyGraphText,
      selectedTargetCharacterIds,
      presentationProfile,
      promptBlocksText,
    }),
  ].join("\n");

  return {
    isSceneDriveTurn,
    presentationProfile,
    promptBlocksText,
    requestContext: appendReferencesToPrompt(directorPrompt, references),
    schedulingInstruction,
  };
};

type TavernDirectorPromptContext = ReturnType<typeof buildTavernDirectorPromptContext>;

export const buildTavernDirectorRuntimeInstruction = (directorPromptContext: TavernDirectorPromptContext) =>
  [
    "你是酒馆模式的导演 Agent。",
    directorPromptContext.isSceneDriveTurn
      ? "你的职责是在没有用户角色发言时，根据场景目标、剧情结构、近期对话和角色状态，推进下一轮公开场景。"
      : "你的职责是根据用户输入、场景目标、剧情结构和角色状态，决定下一轮谁应该发言。",
    directorPromptContext.isSceneDriveTurn
      ? "不要替用户角色说话、回答、行动或下决定；如果需要用户选择，应让剧情停在可介入的位置。"
      : "",
    `当前呈现规则：${directorPromptContext.presentationProfile.label}。${directorPromptContext.presentationProfile.directorAddendum}`,
    '当前系统叙事、酒馆风格和写作规则来自 requestContext 中 target="director" 的 prompt_block；这些是用户保存后的文本，必须按文本执行。',
    "必须输出 supervisor.dispatch-loop JSON：给所有候选 worker 评分，每轮最多选择一个 selectedTargetId。",
    "可以通过 artifacts 插入一条简短旁白来做环境过渡，但不要新增关键事实，不要代替角色行动或长篇发言。",
    "ambientAction artifact 只用于未被 selectedTargetId 选中的角色公开可观察动作，不是角色对白，也不要写心理。",
    "只要有可用 worker，就必须选择一个 selectedTargetId；不要用 complete 表达沉默。",
    directorPromptContext.schedulingInstruction,
    "JSON 字符串内不要使用未转义英文双引号；引用用户短句时改用中文引号。",
    "只输出严格合法 JSON，不要输出 Markdown、代码块或解释。",
  ]
    .filter(Boolean)
    .join("\n");
