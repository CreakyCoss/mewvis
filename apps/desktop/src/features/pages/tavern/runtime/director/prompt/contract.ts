export const buildTavernDirectorOutputContract = ({
  maxSpeakers,
  ambientActionMax,
  isSceneDriveTurn,
  directorOnlyAllowed,
  selectedTargetsCanStaySilent,
  canConsiderRandomEvent,
  canRequestIllustrationHints,
  schedulingInstruction,
}: {
  maxSpeakers: number;
  ambientActionMax: number;
  isSceneDriveTurn: boolean;
  directorOnlyAllowed: boolean;
  selectedTargetsCanStaySilent: boolean;
  canConsiderRandomEvent: boolean;
  canRequestIllustrationHints: boolean;
  schedulingInstruction: string;
}) => {
  const randomEventSchema = canConsiderRandomEvent
    ? `,"randomEvent":"可选；一句公开可观察的随机事件，不触发则留空字符串"`
    : `,"randomEvent":""`;
  const illustrationHintsSchema = canRequestIllustrationHints
    ? `,"illustrationHints":["可选；1-3 条公开可观察的画面提示"]`
    : `,"illustrationHints":[]`;

  return [
    "<output_schema>",
    `{"speakerIds":["character-id"],"nonverbalReplyIds":["character-id"],"ambientActions":[{"characterId":"未发言角色 id","action":"一句可观察动作"}],"narrator":"可选旁白"${randomEventSchema}${illustrationHintsSchema},"reason":"可选简短原因"}`,
    "</output_schema>",
    "",
    `<constraints maxSpeakers="${maxSpeakers}">`,
    "speakerIds 和 nonverbalReplyIds 只能使用下方角色 id；如果需要多人发言，按发言顺序排列。",
    isSceneDriveTurn
      ? "本轮是场景自推动，没有用户角色发言；不要把 scene_drive_directive 当作用户说出口的话，也不要替用户角色回答、承诺、行动或做选择。"
      : "",
    isSceneDriveTurn
      ? "自推动优先根据场景目标、剧情方向、近期对话、待回应事项和角色动机推进；可以安排角色互相回应、旁白过渡或公开可观察事件，但必须保留用户未来介入空间。"
      : "",
    directorOnlyAllowed
      ? "当前阶段允许导演只推进公开流程；如果不应有角色公开发言，可以返回空 speakerIds，并用 narrator 交代公开阶段/结算。"
      : selectedTargetsCanStaySilent
        ? "speakerIds 是本轮角色调用计划，不是氛围描述；若用户明确要求被指定目标只用动作/神态回应，应把该目标放入 nonverbalReplyIds，让角色 Agent 生成自己的心理和动作；若只是弱在场感或无需角色近景反应，才可返回空 speakerIds 并用 ambientActions/narrator 处理。"
        : "speakerIds/nonverbalReplyIds 是本轮角色调用计划，不是氛围描述；只要 characters 非空，二者合计必须至少包含 1 个角色 id。",
    directorOnlyAllowed
      ? "不要为了满足格式硬塞角色发言；夜晚、投票结算、公开结果公布等阶段可只写 narrator。"
      : selectedTargetsCanStaySilent
        ? "不要用空数组表达无事发生；如果目标被明确要求做动作/神态回应，不要把目标写进 ambientActions，而应调度该目标到 nonverbalReplyIds。"
        : "不要用空 speakerIds 和 nonverbalReplyIds 表示沉默、留白、等待或用户要求少说；这种情况选择 1 个最相关角色承接。",
    directorOnlyAllowed
      ? "当用户输入是“嗯”“好”“继续”等短确认时，若当前阶段只需要主持推进，可以返回空 speakerIds。"
      : "当用户输入是“嗯”“好”“继续”等短确认时，也必须选择 1 个角色承接当前岗位状态，不要让 speakerIds 和 nonverbalReplyIds 同时为空。",
    `每轮在 speakerIds/nonverbalReplyIds 中自主选择 1 到 ${maxSpeakers} 个角色，不要为了凑人数而加入无必要发言者。`,
    `如果用户明确点名多个角色发言或给出发言顺序，在 ${maxSpeakers} 人上限内优先按用户点名安排。`,
    "nonverbalReplyIds 可选，只能填写也应被角色 Agent 调用的角色 id；它表示该角色本轮只输出心理和可观察动作，直接对白可以为空。nonverbalReplyIds 中的角色不需要重复写进 speakerIds。",
    "如果用户以某个角色的全名、昵称或可唯一识别称呼开头发出指令/询问，该角色是本轮被点名目标，优先安排其公开回应或行动；除非用户明确要求不用回答/只动作/保持沉默，否则不要放入 nonverbalReplyIds。",
    `普通承接轮次优先选择 1-2 个角色；冲突、会议、多人相关场景可选择最多 ${maxSpeakers} 个角色。`,
    "优先选择最能推进场景目标、回应用户、制造承接关系的角色。",
    "director_profile 是稳定角色调度画像；scheduling_signals 是应用侧每轮根据点名、兴趣、目标、关系、事实、任务和近期发言计算的动态动机。导演可以裁决或修正，但必须优先考虑高分信号和强理由。",
    "scheduling_signals 的 reason 只用于内部调度，不能原样复制进公开 narrator 或泄露到角色公开对白；reason 字段仍只能写公开调度理由。",
    `ambientActions 可选，最多 ${ambientActionMax} 条，只能选择未出现在 speakerIds 和 nonverbalReplyIds 里的角色；只写可被观察到的动作/状态，不写对白、心理、意图或新剧情结果。`,
    "ambientActions 用来让未发言角色保持在场感，例如“莉娜把托盘放回吧台”“莫尔侧身让开门口”；不要为了凑数而生成。",
    "narrator 只能写已发生状态、环境过渡或镜头提示，不要新增关键事实、行动结果或替角色做决定；可为空，建议 40 字内。",
    "reason 只能写公开调度理由，不得包含隐藏身份、阵营、未公开心理、夜间私密行动或验人结果。",
    canConsiderRandomEvent
      ? "randomEvent 由导演决定是否触发；只能写公开可观察的小事件，例如门外脚步、灯火闪动、远处钟声。不要直接解决主线、不要覆盖用户选择、不要替任何角色做关键行动，不触发则输出空字符串。"
      : "randomEvent 当前不可用，必须输出空字符串。",
    canRequestIllustrationHints
      ? "illustrationHints 可选，写 1-3 条适合后续生图的画面提示；只能包含公开可观察的人物、动作、环境、构图和氛围，不写心理、秘密信息、用户未选择的行动或剧情结论。"
      : "illustrationHints 当前不可用，必须输出空数组。",
    "如果已经输出 narrator，后续 speakerIds/nonverbalReplyIds 应选择会对旁白产生角色回应的人；不要安排角色复述 narrator。",
    "输出必须是严格合法 JSON 对象，以 { 开头，以 } 结尾；不要代码块。",
    "</constraints>",
    schedulingInstruction
      ? `\n<director_scheduling_rules>\n${schedulingInstruction}\n</director_scheduling_rules>`
      : "",
  ].join("\n");
};
