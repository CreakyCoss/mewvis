import type { SceneNovelizerPlatformStyleId, SceneNovelizerRuleCategory, SceneNovelizerRuleOptionId } from "../types";

export type SceneNovelizerRuleOption = {
  id: SceneNovelizerRuleOptionId;
  category: SceneNovelizerRuleCategory;
  label: string;
  description: string;
  writingRules: string[];
  judgeFocus: string[];
  defaultForPlatforms: SceneNovelizerPlatformStyleId[];
};

export type SceneNovelizerRulePackageId = "fanqie-fast-hook" | "qidian-longform" | "jinjiang-emotional" | "zhihu-short";

export type SceneNovelizerRulePackage = {
  id: SceneNovelizerRulePackageId;
  label: string;
  description: string;
  platformStyleId: SceneNovelizerPlatformStyleId;
  ruleOptionIds: SceneNovelizerRuleOptionId[];
  strengths: string[];
};

export const SCENE_NOVELIZER_RULE_CATEGORY_LABELS = {
  quality: "质量",
  narrative: "叙事",
  genre: "题材",
  hook: "钩子",
  taboo: "避雷",
} satisfies Record<SceneNovelizerRuleCategory, string>;

const DEFAULT_RULE_IDS_BY_PLATFORM: Record<SceneNovelizerPlatformStyleId, string[]> = {
  fanqie: [
    "anti-ai-natural",
    "natural-dialogue",
    "concise-no-summary",
    "reduce-empty-ambience",
    "direct-commercial-flow",
    "webnovel-high-density",
    "male-progression-growth",
    "conflict-hook",
    "reward-feedback",
    "high-concept-payoff",
    "slow-buildup",
    "long-lore-overexplain",
  ],
  qidian: [
    "anti-ai-natural",
    "natural-dialogue",
    "concise-no-summary",
    "reduce-empty-ambience",
    "webnovel-high-density",
    "male-progression-growth",
    "expectation-hook",
    "reward-feedback",
    "conflict-hook",
    "promise-mismatch",
    "long-lore-overexplain",
  ],
};

const defaultPlatformsForRule = (ruleId: string): SceneNovelizerPlatformStyleId[] =>
  (Object.entries(DEFAULT_RULE_IDS_BY_PLATFORM) as Array<[SceneNovelizerPlatformStyleId, string[]]>).flatMap(
    ([platformStyleId, ruleIds]) => (ruleIds.includes(ruleId) ? [platformStyleId] : []),
  );

const createRuleOption = ({
  id,
  category,
  label,
  description,
  writingRules,
  judgeFocus,
}: Omit<SceneNovelizerRuleOption, "defaultForPlatforms">): SceneNovelizerRuleOption => ({
  id,
  category,
  label,
  description,
  writingRules,
  judgeFocus,
  defaultForPlatforms: defaultPlatformsForRule(id),
});

export const SCENE_NOVELIZER_RULE_OPTIONS: SceneNovelizerRuleOption[] = [
  createRuleOption({
    id: "anti-ai-natural",
    category: "quality",
    label: "去 AI 味",
    description: "减少模板感、概念化总结和过度顺滑的网感套话。",
    writingRules: [
      "不用“命运齿轮”“眼神闪过一丝”“心中涌起”“仿佛整座世界”等模板句。",
      "抽象判断必须落到可见动作、物件变化、身体反应或具体语气上。",
      "不把角色写成全知旁白的代言人，保留迟疑、误判、停顿和现场噪音。",
    ],
    judgeFocus: ["是否出现模板化 AI 句式。", "是否用具体细节替代空泛情绪词。"],
  }),
  createRuleOption({
    id: "natural-dialogue",
    category: "quality",
    label: "对白自然",
    description: "对白要像真人在现场回应，而不是一次性解释资料。",
    writingRules: [
      "对白短句优先，允许打断、追问、留半句和话外音。",
      "每段对白都要带有说话人的目的、情绪或信息差。",
      "避免连续长篇解释；需要交代信息时穿插动作、观察和误会。",
    ],
    judgeFocus: ["对白是否有真人反应和角色差异。", "是否避免资料报告式长对白。"],
  }),
  createRuleOption({
    id: "concise-no-summary",
    category: "quality",
    label: "少总结",
    description: "不在段末替读者总结意义，不把剧情写成复盘报告。",
    writingRules: [
      "段末优先落到动作、风险、选择或下一句对白，不写主题总结。",
      "少用“这意味着”“他终于明白”“所有人都知道”这类解释性收束。",
      "需要交代判断时让角色用动作或一句具体反应承载。",
    ],
    judgeFocus: ["是否存在明显段末总结腔。", "收尾是否保持剧情压力而非解释意义。"],
  }),
  createRuleOption({
    id: "reduce-empty-ambience",
    category: "quality",
    label: "减少空泛环境",
    description: "环境描写必须服务动作、线索、压力或人物状态。",
    writingRules: [
      "不反复写空气、灯光、沉默、风声等无功能氛围。",
      "环境细节要能改变行动判断、揭示线索或压迫角色选择。",
      "场景气氛用可交互物件、声音来源、距离变化和身体触感表达。",
    ],
    judgeFocus: ["环境是否推动剧情或角色判断。", "是否存在大量可删去的气氛句。"],
  }),
  createRuleOption({
    id: "webnovel-high-density",
    category: "narrative",
    label: "网文高密度",
    description: "每几段都要有新信息、新动作、新压力或新反馈。",
    writingRules: [
      "连续两段不能只停留在同一种情绪或同一轮解释。",
      "把素材中的行动、对白、心理和线索拆成短段推进。",
      "每 300 字内至少给出一次可感知的局势变化或关系变化。",
    ],
    judgeFocus: ["段落是否持续推进。", "是否避免原地说明和重复心理。"],
  }),
  createRuleOption({
    id: "direct-commercial-flow",
    category: "narrative",
    label: "商业快推",
    description: "目标、阻碍、反馈清楚，适合快节奏平台读感。",
    writingRules: [
      "开头尽快给出当前目标和最直接阻碍。",
      "用户行动之后立刻给反馈，不把后果延后成旁白说明。",
      "冲突升级要具体：有人逼近、证据失效、资源减少或关系撕裂。",
    ],
    judgeFocus: ["目标和阻碍是否清楚。", "用户行动后果是否即时出现。"],
  }),
  createRuleOption({
    id: "emotional-push-pull",
    category: "narrative",
    label: "情绪拉扯",
    description: "用关系张力、误会、试探和代价推动段落。",
    writingRules: [
      "人物亲近或疏离都要有可见代价，不写无来源的情绪爆发。",
      "对白里保留潜台词和未说出口的顾虑。",
      "每个情绪转折都要对应具体动作或信息变化。",
    ],
    judgeFocus: ["关系张力是否来自行动与信息差。", "情绪转折是否具体可信。"],
  }),
  createRuleOption({
    id: "light-novel-banter",
    category: "narrative",
    label: "轻小说抛接",
    description: "保留轻快反应、吐槽和角色节奏，但不牺牲情节推进。",
    writingRules: [
      "吐槽必须暴露角色关系或缓冲压力，不能变成闲聊。",
      "轻快对白后要接一个动作、线索或局势变化。",
      "角色反应要有差异，不用同一种语气轮流接话。",
    ],
    judgeFocus: ["轻快对白是否仍服务剧情。", "角色语气是否可区分。"],
  }),
  createRuleOption({
    id: "delicate-daily",
    category: "narrative",
    label: "细腻日常",
    description: "用生活化动作和微小变化承接情绪，适合慢热片段。",
    writingRules: [
      "细节要来自具体物件、动作顺序和角色习惯。",
      "日常段落仍要有小目标、小误会或小后果。",
      "避免把细腻写成静态抒情堆叠。",
    ],
    judgeFocus: ["生活细节是否具体。", "慢节奏是否仍有可读目标。"],
  }),
  createRuleOption({
    id: "male-progression-growth",
    category: "genre",
    label: "男频成长",
    description: "强调目标、资源、危机判断和能力/信息收益。",
    writingRules: [
      "用户行动要转化为资源、情报、地位、风险或能力理解上的变化。",
      "冲突要能体现实力差、信息差或规则差。",
      "避免只写被动询问；主角必须对局势产生实际影响。",
    ],
    judgeFocus: ["是否有成长或收益反馈。", "主角是否推动局势变化。"],
  }),
  createRuleOption({
    id: "female-romance-relationship",
    category: "genre",
    label: "女频关系",
    description: "强调关系边界、情绪价值和选择成本。",
    writingRules: [
      "关系推进必须伴随态度变化、信任变化或边界变化。",
      "不让角色只围绕主角无条件付出。",
      "重要情绪点用具体举动、停顿和回避表达。",
    ],
    judgeFocus: ["关系变化是否具体可信。", "是否避免无成本偏爱。"],
  }),
  createRuleOption({
    id: "short-emotional-story",
    category: "genre",
    label: "短篇情绪",
    description: "聚焦一个强情绪问题，快速形成反转或刺点。",
    writingRules: [
      "每个场景只抓一个核心情绪问题，不铺过多设定。",
      "用一个误会、选择或证据变化推动反转。",
      "结尾留下情绪余波或新代价，而不是讲道理。",
    ],
    judgeFocus: ["情绪主线是否集中。", "反转或刺点是否清楚。"],
  }),
  createRuleOption({
    id: "acg-character-fun",
    category: "genre",
    label: "角色趣味",
    description: "突出人设反差、口癖和互动趣味，但不脱离当前事实。",
    writingRules: [
      "角色趣味来自设定、动作和说话方式，不用硬贴标签。",
      "萌点、怪癖或反差要影响互动选择。",
      "不为了卖人设让角色忽视危险或主线。",
    ],
    judgeFocus: ["人设是否自然进入行动。", "趣味是否破坏主线压力。"],
  }),
  createRuleOption({
    id: "conflict-hook",
    category: "hook",
    label: "冲突钩子",
    description: "用外部压力、对立目标或关系撕裂制造追读。",
    writingRules: [
      "结尾前制造一个必须回应的冲突，不以解释结束。",
      "冲突来源要具体可见：人、物、倒计时、证据或空间封锁。",
      "不要让冲突在同段内被轻易解决。",
    ],
    judgeFocus: ["是否有明确下一步冲突。", "冲突是否具体而未被立刻化解。"],
  }),
  createRuleOption({
    id: "expectation-hook",
    category: "hook",
    label: "期待钩子",
    description: "设置读者想知道的身份、规则、奖励或下一阶段目标。",
    writingRules: [
      "把当前小线索接到更大的未知上。",
      "给出清楚的下一阶段目标，但不提前兑现核心答案。",
      "期待点要与用户行动和场景目标相关。",
    ],
    judgeFocus: ["是否形成下一阶段期待。", "是否避免承诺与正文内容错位。"],
  }),
  createRuleOption({
    id: "reward-feedback",
    category: "hook",
    label: "反馈爽点",
    description: "让行动带来明确反馈，形成继续行动的动力。",
    writingRules: [
      "用户或主角每次有效行动后都要有可见收益、代价或局势变化。",
      "反馈不一定是胜利，但必须让读者感到行动有重量。",
      "避免角色只继续提问而没有反馈。",
    ],
    judgeFocus: ["行动后果是否可见。", "反馈是否让剧情继续前进。"],
  }),
  createRuleOption({
    id: "reversal-healing",
    category: "hook",
    label: "反转治愈",
    description: "用误会解除、关系补偿或隐性善意形成情绪回报。",
    writingRules: [
      "反转要有前文可追溯的细节，不空降解释。",
      "治愈点要通过动作或选择兑现，不靠旁白宣布。",
      "保留一点未解决压力，避免全局过早圆满。",
    ],
    judgeFocus: ["反转是否有铺垫。", "情绪回报是否由行动兑现。"],
  }),
  createRuleOption({
    id: "topic-resonance",
    category: "hook",
    label: "话题共鸣",
    description: "把选择压力落到身份、关系、现实困境或价值冲突上。",
    writingRules: ["话题点必须嵌入角色选择，不另起议论文。", "用具体困境承载价值冲突。", "不替读者做道德总结。"],
    judgeFocus: ["共鸣点是否来自剧情选择。", "是否避免说教。"],
  }),
  createRuleOption({
    id: "high-concept-payoff",
    category: "hook",
    label: "高概念兑现",
    description: "让核心设定在本段产生可见效果，而不是只被介绍。",
    writingRules: [
      "特殊规则、系统、身份或世界观必须改变现场选择。",
      "设定说明不超过行动需要，优先展示效果。",
      "每段高概念信息都要带来风险、收益或误判。",
    ],
    judgeFocus: ["设定是否产生现场效果。", "是否避免纯世界观说明。"],
  }),
  createRuleOption({
    id: "feilu-toxic-points",
    category: "taboo",
    label: "避飞卢毒点",
    description: "避免主角无能、收益拖延、敌我压迫失衡和爽点断档。",
    writingRules: [
      "主角不能只被动承压，至少要做出一次有效判断或反制准备。",
      "强压迫后要给出信息、资源或局势上的补偿反馈。",
      "不要让关键角色无理由羞辱或降智。",
    ],
    judgeFocus: ["主角是否有能动性。", "压迫与反馈是否平衡。"],
  }),
  createRuleOption({
    id: "female-values-drift",
    category: "taboo",
    label: "避价值漂移",
    description: "避免角色立场突然改变、关系边界混乱或情绪价值失真。",
    writingRules: [
      "角色态度变化必须有可见理由。",
      "亲密、牺牲、原谅都要有成本和边界。",
      "不把冲突强行写成所有人都理解主角。",
    ],
    judgeFocus: ["价值立场是否稳定。", "关系推进是否有成本。"],
  }),
  createRuleOption({
    id: "promise-mismatch",
    category: "taboo",
    label: "避承诺错位",
    description: "开头承诺的冲突、题材和期待不能在正文中消失。",
    writingRules: [
      "正文必须回应场景目标和当前未解钩子。",
      "不要把强悬疑、强冲突写成闲谈或日常铺垫。",
      "章尾钩子要接续本场承诺，而不是另起一个无关疑问。",
    ],
    judgeFocus: ["正文是否兑现当前场景承诺。", "章尾是否接住既有期待。"],
  }),
  createRuleOption({
    id: "slow-buildup",
    category: "taboo",
    label: "避慢热空转",
    description: "避免长时间铺垫、绕场、解释背景而没有事件变化。",
    writingRules: [
      "前三段内必须出现目标、异常、冲突或行动后果。",
      "背景信息只在角色必须用到时写。",
      "如果素材偏静态，要提炼出最尖锐的选择压力。",
    ],
    judgeFocus: ["开头是否快速进入事件。", "铺垫是否造成空转。"],
  }),
  createRuleOption({
    id: "long-lore-overexplain",
    category: "taboo",
    label: "避设定长讲",
    description: "避免连续解释世界观、规则、案情和背景资料。",
    writingRules: [
      "设定信息拆进动作、对白和物件变化里。",
      "单次解释不超过当前行动所需。",
      "出现长推理时用打断、证据变化或角色反应切开。",
    ],
    judgeFocus: ["是否出现长篇设定说明。", "信息是否通过行动和证据展开。"],
  }),
  createRuleOption({
    id: "unearned-reconciliation",
    category: "taboo",
    label: "避无成本和解",
    description: "避免冲突未付代价就突然和解、原谅或达成一致。",
    writingRules: [
      "和解必须有行动、证据、让步或风险承担。",
      "矛盾可以缓和，但不要无条件清零。",
      "情绪回落后仍保留下一步压力。",
    ],
    judgeFocus: ["关系修复是否有代价。", "冲突是否被过早清零。"],
  }),
];

const SCENE_NOVELIZER_RULE_OPTION_BY_ID = new Map(
  SCENE_NOVELIZER_RULE_OPTIONS.map((option) => [option.id, option] as const),
);

const flattenValues = (value: unknown): unknown[] => (Array.isArray(value) ? value.flatMap(flattenValues) : [value]);

export const normalizeSceneNovelizerRuleOptionIds = (value: unknown): SceneNovelizerRuleOptionId[] =>
  Array.from(
    new Set(
      flattenValues(value).flatMap((item) =>
        typeof item === "string" && SCENE_NOVELIZER_RULE_OPTION_BY_ID.has(item) ? [item] : [],
      ),
    ),
  );

export const getSceneNovelizerRuleOptions = (value: unknown): SceneNovelizerRuleOption[] =>
  normalizeSceneNovelizerRuleOptionIds(value)
    .map((id) => SCENE_NOVELIZER_RULE_OPTION_BY_ID.get(id))
    .filter((option): option is SceneNovelizerRuleOption => Boolean(option));

export const getDefaultSceneNovelizerRuleOptionIds = (
  platformStyleId: SceneNovelizerPlatformStyleId,
): SceneNovelizerRuleOptionId[] => normalizeSceneNovelizerRuleOptionIds(DEFAULT_RULE_IDS_BY_PLATFORM[platformStyleId]);

export const SCENE_NOVELIZER_RULE_PACKAGES: SceneNovelizerRulePackage[] = [
  {
    id: "fanqie-fast-hook",
    label: "番茄快节奏",
    description: "短段强推进，重即时后果、冲突打断和章尾钩子。",
    platformStyleId: "fanqie",
    ruleOptionIds: [
      "anti-ai-natural",
      "natural-dialogue",
      "concise-no-summary",
      "reduce-empty-ambience",
      "direct-commercial-flow",
      "webnovel-high-density",
      "male-progression-growth",
      "conflict-hook",
      "reward-feedback",
      "high-concept-payoff",
      "slow-buildup",
      "long-lore-overexplain",
    ],
    strengths: ["短段落", "强反馈", "强钩子"],
  },
  {
    id: "qidian-longform",
    label: "起点长篇",
    description: "主线牵引和长期追读优先，适合势力线、规则线和成长线。",
    platformStyleId: "qidian",
    ruleOptionIds: [
      "anti-ai-natural",
      "natural-dialogue",
      "concise-no-summary",
      "reduce-empty-ambience",
      "webnovel-high-density",
      "male-progression-growth",
      "expectation-hook",
      "reward-feedback",
      "conflict-hook",
      "promise-mismatch",
      "long-lore-overexplain",
    ],
    strengths: ["长线目标", "成长反馈", "期待钩"],
  },
  {
    id: "jinjiang-emotional",
    label: "晋江情绪线",
    description: "关系边界、情绪拉扯和选择成本优先，适合细腻关系场。",
    platformStyleId: "qidian",
    ruleOptionIds: [
      "anti-ai-natural",
      "natural-dialogue",
      "concise-no-summary",
      "reduce-empty-ambience",
      "emotional-push-pull",
      "delicate-daily",
      "female-romance-relationship",
      "expectation-hook",
      "reversal-healing",
      "female-values-drift",
      "unearned-reconciliation",
    ],
    strengths: ["情绪拉扯", "关系边界", "低说教"],
  },
  {
    id: "zhihu-short",
    label: "知乎短篇",
    description: "一个核心问题快速推进，重反转、话题刺点和结尾余波。",
    platformStyleId: "fanqie",
    ruleOptionIds: [
      "anti-ai-natural",
      "natural-dialogue",
      "concise-no-summary",
      "reduce-empty-ambience",
      "short-emotional-story",
      "topic-resonance",
      "expectation-hook",
      "reversal-healing",
      "promise-mismatch",
      "slow-buildup",
    ],
    strengths: ["强问题", "快反转", "话题刺点"],
  },
];

export const DEFAULT_SCENE_NOVELIZER_RULE_PACKAGE_ID: SceneNovelizerRulePackageId = "fanqie-fast-hook";

export const getSceneNovelizerRulePackage = (value?: string | null): SceneNovelizerRulePackage =>
  SCENE_NOVELIZER_RULE_PACKAGES.find((item) => item.id === value) ??
  SCENE_NOVELIZER_RULE_PACKAGES.find((item) => item.id === DEFAULT_SCENE_NOVELIZER_RULE_PACKAGE_ID) ??
  SCENE_NOVELIZER_RULE_PACKAGES[0];
