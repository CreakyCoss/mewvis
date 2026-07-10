import type {
  TavernSystemNarrativeSettings,
  TavernSystemNarrativeStyleId,
} from "@/features/pages/stories/tavern/manage/model";

export type TavernSystemNarrativeStyle = {
  id: TavernSystemNarrativeStyleId;
  label: string;
  description: string;
  directorAddendum: string;
  characterRules: {
    narrativeBeat: string[];
    dialogueImmersive: string[];
    dialoguePlain: string[];
  };
};

const balancedSystemNarrativeStyle = {
  id: "balanced",
  label: "均衡叙事",
  description: "默认系统叙事策略，兼顾现场推进、角色承接、可读密度和用户选择空间。",
  directorAddendum: "导演优先安排能推进场景目标、回应用户输入、制造承接关系的角色；节奏保持可继续互动，不急于闭环。",
  characterRules: {
    narrativeBeat: [
      "- 小说正文段控制在 1 到 3 个自然段；优先推进当前场景的可观察动作、心理压强和信息增量。",
      "- 不要使用第一人称叙事主体；用角色名或他/她承接动作和心理。",
      "- 不要把房间文风、角色风格或系统规则写成解释；只输出故事正文。",
    ],
    dialogueImmersive: [
      "- 公开回复段可附带 0 到 1 段 Markdown 单星号动作标注，只写可观察小动作；默认对白优先，只有本轮 turn instruction 明确允许非语言回应时才可以只写动作。",
      "- 动作不要用第一人称叙述；可写角色名或他/她的动作，不写心理解释、比喻、环境铺陈或剧情总结。",
      "- 单次回复控制在 1 到 3 个自然段。",
    ],
    dialoguePlain: [
      "- 优先直接回应用户或上一位角色；动作仅在必要时简短使用，不能承载主要信息。",
      "- 不要主动加入独立氛围描写段；本次只写当前角色的一段回应。",
    ],
  },
} satisfies TavernSystemNarrativeStyle;

const restrainedSystemNarrativeStyle = {
  id: "restrained",
  label: "克制留白",
  description: "降低戏剧化和修辞密度，强调行为因果、关系阶段和未说尽的张力。",
  directorAddendum: "少用强事件和强转折，优先自然、可观察、因果明确的推进；允许关系和信息慢慢显影。",
  characterRules: {
    narrativeBeat: [
      "- 小说正文段控制在 1 到 2 个自然段；优先写清动作、停顿、信息落点和关系变化。",
      "- 减少夸张修辞、宏大情绪和结论性旁白；让张力留在行为和对白未尽处。",
      "- 不要替现场快速定性或替用户做选择；结尾保留一个可继续承接的细小钩子。",
    ],
    dialogueImmersive: [
      "- 公开回复段以短对白为主，动作标注只保留必要可见行为。",
      "- 少用解释性动作和心理外化；不要用长段氛围描写替代回应。",
      "- 保持关系阶段和信任阶梯，不因单轮输入突然亲密、崩溃或和解。",
    ],
    dialoguePlain: [
      "- 回复短而明确，优先兑现当前问题、承诺或冲突点。",
      "- 不主动加入华丽描写、总结性闭环或过度情绪说明。",
    ],
  },
} satisfies TavernSystemNarrativeStyle;

const dramaticSystemNarrativeStyle = {
  id: "dramatic",
  label: "张力推进",
  description: "提高冲突、选择压力和场景推进力度，但仍保留用户关键选择权。",
  directorAddendum:
    "导演优先调度最能制造承接、冲突、信息增量或选择压力的角色；随机事件只增加公开压力，不直接解决主线。",
  characterRules: {
    narrativeBeat: [
      "- 小说正文段控制在 2 到 5 个短自然段；每段通常 40 到 120 个中文字符，避免几百字大段。",
      "- 每轮至少给出一个公开可观察的张力变化、立场碰撞或信息增量。",
      "- 冲突必须来自既有人设、目标、事实或关系，不要为了戏剧性强行反转。",
      "- 推进到可回应的压力点即可停住，不替用户完成关键决定。",
    ],
    dialogueImmersive: [
      "- 公开回复段优先体现角色立场、欲望、疑问或压力；动作服务冲突，不做无关铺陈。",
      "- 可以让对白更锋利或更有目标感，但不要越过角色已知信息和关系阶段。",
      "- 结尾留出可被用户或下一角色接住的问题、要求、威胁、条件或承诺。",
    ],
    dialoguePlain: [
      "- 回复要有明确立场或行动压力，避免只寒暄、等待或总结。",
      "- 不用强行升格冲突；紧扣当前场景目标和角色动机。",
    ],
  },
} satisfies TavernSystemNarrativeStyle;

export const TAVERN_SYSTEM_NARRATIVE_STYLES = [
  balancedSystemNarrativeStyle,
  restrainedSystemNarrativeStyle,
  dramaticSystemNarrativeStyle,
] satisfies TavernSystemNarrativeStyle[];

export const DEFAULT_TAVERN_SYSTEM_NARRATIVE_STYLE_ID: TavernSystemNarrativeStyleId = balancedSystemNarrativeStyle.id;

const systemNarrativeStylesById = new Map(TAVERN_SYSTEM_NARRATIVE_STYLES.map((style) => [style.id, style] as const));

const withPublicContentTag = (rules: string[], publicContentTag: string) =>
  rules.map((rule) => rule.split("{publicContentTag}").join(publicContentTag));

export const normalizeTavernSystemNarrativeStyleId = (value: unknown): TavernSystemNarrativeStyleId =>
  typeof value === "string" && systemNarrativeStylesById.has(value as TavernSystemNarrativeStyleId)
    ? (value as TavernSystemNarrativeStyleId)
    : DEFAULT_TAVERN_SYSTEM_NARRATIVE_STYLE_ID;

export const getTavernSystemNarrativeStyle = (value: unknown): TavernSystemNarrativeStyle =>
  systemNarrativeStylesById.get(normalizeTavernSystemNarrativeStyleId(value))!;

export const formatTavernSystemNarrativeCharacterRules = ({
  style,
  publicContentTag,
  usesNarrativeBeat,
  immersiveDescriptionEnabled,
}: {
  style: TavernSystemNarrativeStyle;
  publicContentTag: string;
  usesNarrativeBeat: boolean;
  immersiveDescriptionEnabled: boolean;
}) => {
  if (usesNarrativeBeat) {
    return withPublicContentTag(style.characterRules.narrativeBeat, publicContentTag);
  }
  return withPublicContentTag(
    immersiveDescriptionEnabled ? style.characterRules.dialogueImmersive : style.characterRules.dialoguePlain,
    publicContentTag,
  );
};

export const formatTavernSystemNarrativeStyleForPrompt = ({
  settings,
  style,
  target,
}: {
  settings: TavernSystemNarrativeSettings;
  style: TavernSystemNarrativeStyle;
  target: "director" | "character";
}) =>
  [
    `系统叙事：${style.label}。${style.description}`,
    target === "director" ? style.directorAddendum : "",
    settings.customInstructions ? `房间自定义叙事要求：${settings.customInstructions}` : "",
  ]
    .filter(Boolean)
    .join("\n");
