import type { TavernMessage } from "../types";
import type { TavernCharacter, TavernRoomSettings, TavernSceneStatus } from "@/features/pages/taverns/manage/model";

const userQuestionPattern =
  /[?？]|(?:谁|什么|为何|为什么|怎么|怎样|是否|是不是|哪里|哪儿|能不能|可以吗|告诉|解释|确认|问)/u;
const userActionPattern =
  /(?:我|旅人|主角|咱们)?(?:走|冲|推|拉|打开|关上|检查|查看|摸|拿|递|绕|躲|追|靠近|离开|拔|点燃|敲|砸|观察|搜|翻|准备|尝试|试图|决定|选择|跟|进入|退出|守|挡|按住|递给|交给|藏|放下|拾起|行动)/u;
const shortContinuePattern = /^(?:嗯|好|继续|接着|然后|行|可以|下一步|往下|看看|走吧)[。.!！\s]*$/u;

const hasTavernNonverbalTargetCue = (text: string) =>
  /(?:不用|不必|不要|别)(?:回答|回复|回应|开口)|只(?:用|要)(?:动作|神态|眼神)|(?:动作|神态|眼神)(?:回应|表示)|(?:可以|可)(?:沉默|不回答|不回复|不开口|只用动作)|保持沉默|沉默回应|没有开口|不出声/u.test(
    text,
  );

const classifyCurrentUserMove = (
  text: string,
  isSceneDriveTurn: boolean,
  agencyMode: TavernRoomSettings["directorNarrativeControl"]["agencyMode"],
) => {
  const trimmed = text.trim();
  if (isSceneDriveTurn) {
    return "scene_drive";
  }
  if (agencyMode === "scene_drive" && (!trimmed || shortContinuePattern.test(trimmed))) {
    return "scene_drive";
  }
  if (shortContinuePattern.test(trimmed)) {
    return "continue";
  }
  if (userActionPattern.test(trimmed)) {
    return "action";
  }
  if (userQuestionPattern.test(trimmed)) {
    return "question";
  }
  return trimmed ? "statement" : "empty";
};

type TavernSceneDriveGuidance = {
  currentMove: "scene_drive" | "continue" | "action" | "question" | "statement" | "empty";
  controls: TavernRoomSettings["directorNarrativeControl"];
  needsSceneDriveProgression: boolean;
  requiredMoves: string[];
  suggestedPublicPressure: string[];
};

export const buildTavernSceneDriveGuidance = ({
  settings,
  scene,
  currentUserText,
  isSceneDriveTurn = false,
}: {
  settings: TavernRoomSettings;
  scene: {
    sceneGoal: string;
    scenePlot: string;
    storyGoal: string;
    sceneStatus?: TavernSceneStatus;
  };
  messages: TavernMessage[];
  currentUserText: string;
  isSceneDriveTurn?: boolean;
}): TavernSceneDriveGuidance => {
  const controls = settings.directorNarrativeControl;
  const currentMove = classifyCurrentUserMove(currentUserText, isSceneDriveTurn, controls.agencyMode);
  const hasSceneGoal = Boolean(scene.sceneGoal.trim() || scene.storyGoal.trim() || scene.scenePlot.trim());
  const needsSceneDriveProgression = currentMove === "scene_drive" && hasSceneGoal;
  const suggestedPublicPressure = [
    scene.sceneStatus?.immediateThreat ? `推进当前公开威胁：${scene.sceneStatus.immediateThreat}` : "",
    scene.sceneStatus?.weather ? `让天气影响线索或行动：${scene.sceneStatus.weather}` : "",
    scene.sceneStatus?.timeLabel ? `体现时间压力：${scene.sceneStatus.timeLabel}` : "",
    scene.sceneStatus?.location ? `利用当前地点制造空间变化：${scene.sceneStatus.location}` : "",
  ].filter(Boolean);
  const requiredMoves = [
    needsSceneDriveProgression
      ? "本轮是场景自推动，应主动安排合适角色、公开旁白或可观察事件推进场景目标；不要停在等待用户输入。"
      : "",
  ].filter(Boolean);

  return {
    currentMove,
    controls,
    needsSceneDriveProgression,
    requiredMoves,
    suggestedPublicPressure,
  };
};

const formatAgencyModeInstruction = (agencyMode: TavernRoomSettings["directorNarrativeControl"]["agencyMode"]) => {
  if (agencyMode === "scene_drive") {
    return [
      "用户控制权：scene_drive。用户短确认、空输入或续写信号表示希望场景自推动；导演应根据场景目标、近期矛盾、角色动机和公开压力主动调度合适角色互相推进。",
      "即使自推动，也不能替用户角色做关键选择、承诺、攻击、逃跑、告白、认罪或内心定论；推进应停在新的公开压力、线索变化、角色行动或需要用户介入的位置。",
    ].join("\n");
  }

  if (agencyMode === "story_directive") {
    return [
      "用户控制权：story_directive。用户输入优先视为剧情指令、镜头方向或想看的推进，而不是用户角色逐字说出口的话。",
      "导演可以把用户指令拆成公开场景变化、角色调度和旁白承接，但不能违背指令，也不能替用户补完未选择的关键行动或结果。",
    ].join("\n");
  }

  return [
    "用户控制权：player_protagonist。用户输入优先视为用户扮演主角的行动、话语或意图。",
    "导演必须尊重用户主角能动性：可以安排 NPC 回应、环境后果和公开压力，但不能替用户角色继续行动、代替用户选择路线、写用户未公开心理或把用户台词改成剧情指令。",
  ].join("\n");
};

export const canTavernCharacterUseNonverbalReply = ({
  characterId,
  selectedTargetCharacterIds,
  directorNonverbalReplyIds,
  currentUserText,
  directorReason,
}: {
  characterId: string;
  selectedTargetCharacterIds?: string[];
  directorNonverbalReplyIds?: string[];
  currentUserText?: string;
  directorReason?: string | null;
}) =>
  Boolean(directorNonverbalReplyIds?.includes(characterId)) ||
  (Boolean(selectedTargetCharacterIds?.includes(characterId)) &&
    (hasTavernNonverbalTargetCue(currentUserText ?? "") || hasTavernNonverbalTargetCue(directorReason ?? "")));

const uniqueCharacters = (characters: TavernCharacter[]) => {
  const seen = new Set<string>();
  return characters.filter((character) => {
    if (seen.has(character.id)) {
      return false;
    }
    seen.add(character.id);
    return true;
  });
};

const mergeTavernCharacterIds = (...characterIdLists: Array<readonly string[] | undefined | null>) => {
  const seen = new Set<string>();
  return characterIdLists
    .flatMap((list) => list ?? [])
    .flatMap((characterId) => {
      const normalized = characterId.trim();
      if (!normalized || seen.has(normalized)) {
        return [];
      }
      seen.add(normalized);
      return [normalized];
    });
};

export const resolveTavernScheduledSpeakers = ({
  availableCharacters,
  directorSpeakerIds,
  directorNonverbalReplyIds,
  selectedTargetCharacterIds,
  fallbackCharacter,
}: {
  availableCharacters: TavernCharacter[];
  directorSpeakerIds: string[];
  directorNonverbalReplyIds?: string[];
  selectedTargetCharacterIds?: string[];
  fallbackCharacter?: TavernCharacter | null;
}): TavernCharacter[] => {
  const characterById = new Map(availableCharacters.map((character) => [character.id, character]));
  const directedSpeakers = uniqueCharacters(
    mergeTavernCharacterIds(directorNonverbalReplyIds, directorSpeakerIds)
      .map((characterId) => characterById.get(characterId))
      .filter((character): character is TavernCharacter => Boolean(character)),
  );
  const targetSpeakers = uniqueCharacters(
    (selectedTargetCharacterIds ?? [])
      .map((characterId) => characterById.get(characterId))
      .filter((character): character is TavernCharacter => Boolean(character)),
  );

  if (directedSpeakers.length > 0) {
    return directedSpeakers;
  }

  if (targetSpeakers.length > 0) {
    return targetSpeakers.slice(0, 1);
  }

  return fallbackCharacter ? [fallbackCharacter] : availableCharacters.slice(0, 1);
};

export const formatTavernDirectorSchedulingInstruction = (settings: TavernRoomSettings) => {
  const narrativeControl = settings.directorNarrativeControl;

  return [
    "导演操作策略由应用设置控制，优先级高于呈现风格提示。",
    formatAgencyModeInstruction(narrativeControl.agencyMode),
    `调度规模：${narrativeControl.responseScale}。focused=通常 1 个关键角色；balanced=1-2 个角色；ensemble=冲突/会议/多人目标时可接近上限，但仍不得凑人数。`,
    `旁白压力：${narrativeControl.narratorPressure}。low=少旁白；balanced=用短旁白承接场景压力；high=更积极用 narrator 整合环境变化、未发言动作和公开压力。`,
    "如果用户明确点名或选择回复对象，优先评估该角色；如果用户明确要求只用动作或神态回应，应选择该角色并要求非语言近景回应。",
    "如果最近多轮都只是用户点名问询、角色逐一解释线索，导演应重新评估 sceneGoal、scenePlot、immediateThreat、角色目标和待回应事项，优先安排能带来局势变化、关系冲突、风险暴露或下一步行动压力的角色。",
  ].join("\n");
};
