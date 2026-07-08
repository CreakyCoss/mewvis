export const buildTavernDirectorOutputContract = ({
  maxSpeakers,
  ambientActionMax,
  isSceneDriveTurn,
  schedulingInstruction,
}: {
  maxSpeakers: number;
  ambientActionMax: number;
  isSceneDriveTurn: boolean;
  schedulingInstruction: string;
}) => {
  const artifactTypes = "narrator|ambientAction";

  return [
    "<output_schema>",
    `{"status":"continue|complete|blocked","candidates":[{"targetId":"worker participantId","score":0,"reason":"公开调度理由","instruction":"给该 worker 的本轮任务"}],"selectedTargetId":"worker participantId 或空字符串","selectedInstruction":"给被选 worker 的本轮任务；无被选 worker 时为空字符串","reason":"公开调度理由","artifacts":[{"type":"${artifactTypes}","content":"公开可见内容","targetId":"可选 worker participantId"}]}`,
    "</output_schema>",
    "",
    `<constraints maxSpeakers="${maxSpeakers}">`,
    "targetId 必须使用 supervisor.dispatch-loop runtimeInstruction 中 available_workers / workerTargets 的 participantId，不是 characterId，也不是角色名。",
    "每一轮必须给所有候选 worker 写 candidates，并按 0-100 评分；score 越高表示越应该在本轮继续执行。",
    "每一轮最多选择一个 worker：selectedTargetId 只能是一个 participantId；不要输出数组，不要一次选择多人。",
    "如果本轮不需要 worker 执行，status 使用 complete，selectedTargetId 和 selectedInstruction 留空，并用 artifacts 返回旁白、公开事件或环境动作。",
    isSceneDriveTurn
      ? "本轮是场景自推动，没有用户角色发言；不要把 scene_drive_directive 当作用户说出口的话，也不要替用户角色回答、承诺、行动或做选择。"
      : "",
    isSceneDriveTurn
      ? "自推动优先根据场景目标、剧情方向、近期对话、待回应事项和角色动机推进；可以安排角色互相回应、旁白过渡或公开可观察事件，但必须保留用户未来介入空间。"
      : "",
    "只要存在可用 worker，本轮通常必须选择一个最相关 worker 承接；不要用 complete 表达沉默、留白、等待或用户要求少说。",
    "如果目标被明确要求做动作/神态回应，不要把目标写进 ambientAction，而应选择该 worker，并在 selectedInstruction 中要求只输出心理和可观察动作。",
    "当用户输入是“嗯”“好”“继续”等短确认时，也必须选择 1 个 worker 承接当前岗位状态。",
    `业务侧最多允许本轮调度 ${maxSpeakers} 个角色，但 supervisor.dispatch-loop 每次只选择一个；如需要多人，依赖后续回环继续选择。`,
    "如果用户明确点名多个角色发言或给出发言顺序，先选择最应该第一个回应的 worker，并在 candidates.reason 中说明其他候选排序。",
    "如果用户以某个角色的全名、昵称或可唯一识别称呼开头发出指令/询问，该角色是本轮被点名目标，优先选择对应 worker 公开回应或行动；除非用户明确要求不用回答/只动作/保持沉默。",
    "优先选择最能推进场景目标、回应用户、制造承接关系的 worker。",
    "director_operation_policy 是应用层导演控制，优先级高于 presentation_profile；presentation_profile 只决定输出形态，不决定用户控制权或调度策略。",
    "当 director_operation_policy.agencyMode 为 player_protagonist，用户输入是用户主角行动/话语/意图，导演不得替用户继续行动、替用户做关键选择或写用户未公开心理。",
    "当 director_operation_policy.agencyMode 为 story_directive，用户输入是剧情指令或镜头方向，导演可拆成公开场景变化和角色调度，但不能违背指令或补完用户未选择的关键结果。",
    "当 director_operation_policy.agencyMode 为 scene_drive，短确认、空输入或续写信号表示场景自推动；导演应主动安排角色互相推进、旁白承接或公开事件，但仍要保留用户介入空间。",
    "scene_drive_guidance 是应用侧对本轮推进质量的诊断；如果 requiredMoves 非空，导演必须用 artifacts 或 selectedTargetId 的选择满足其中至少一项，不要继续生成纯问答。",
    "当 scene_drive_guidance.needsSceneDriveProgression 为 true，本轮必须根据场景目标、剧情方向、角色动机和公开压力主动推进，不要只总结上一轮或等待用户继续。",
    `ambientAction artifact 可选，最多 ${ambientActionMax} 条，只能选择未被 selectedTargetId 选中的 worker；只写可被观察到的动作/状态，不写对白、心理、意图或新剧情结果。`,
    "ambientAction 用来让未发言角色保持在场感，例如“莉娜把托盘放回吧台”“莫尔侧身让开门口”；不要为了凑数而生成。小说正文/第三人称呈现下尤其要少用零散 ambientAction，能交给被选 worker 自然带出的动作就不要拆成独立短句。",
    "narrator artifact 只能写公开可见的场景承接、状态变化、环境压力或镜头提示；可以让已存在的场景元素产生轻微公开变化，例如雨水冲淡脚印、门缝漏风、炉火骤暗、远处脚步压近，但不要新增关键结论、泄露秘密、解决主线或替用户选择行动。",
    "对话模式 narrator artifact 建议 40 字内；小说正文/第三人称呈现可写 80-120 字的短场景段，用来合并多个零散 ambientAction、承接上一轮尾句、制造公开压力和连续阅读感。",
    "reason 只能写公开调度理由，不得包含隐藏身份、阵营、未公开心理、夜间私密行动或验人结果；不要只写“用户点名某角色”，还要说明该角色为何最能推进场景目标、压力、冲突或信息增量。",
    "如果已经输出 narrator artifact，selectedTargetId 应选择会对旁白产生角色回应的人；不要安排 worker 复述 narrator。",
    "输出必须是严格合法 JSON 对象，以 { 开头，以 } 结尾；不要代码块。",
    "</constraints>",
    schedulingInstruction
      ? `\n<director_scheduling_rules>\n${schedulingInstruction}\n</director_scheduling_rules>`
      : "",
  ].join("\n");
};
