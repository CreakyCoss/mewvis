import { DEFAULT_TAVERN_INTERACTION_QUALITY_RULE_IDS } from "./prompt-registry/rule-layers/resolver";
import type { TavernRoomSettings } from "@/features/pages/taverns/manage/model";

export const DEFAULT_TAVERN_ROOM_SETTINGS: TavernRoomSettings = {
  immersiveDescriptionEnabled: true,
  directorMaxSpeakers: 3,
  directorLoop: {
    enabled: true,
    maxRounds: 2,
  },
  interactionQualityRuleIds: [...DEFAULT_TAVERN_INTERACTION_QUALITY_RULE_IDS],
  directorNarrativeControl: {
    agencyMode: "player_protagonist",
    responseScale: "balanced",
    narratorPressure: "balanced",
    eventInterruption: "auto",
    userActionConsequence: "visible",
    mainHook: "auto",
    qnaBreak: "auto",
  },
  directorScheduling: {
    targetedReplyPolicy: "prefer",
    maxExtraSpeakersOnTargetedReply: 2,
    allowDirectorOnly: false,
    speakerMotivation: {
      enabled: true,
      maxMotivatedSpeakers: 2,
      rules: [
        {
          id: "direct-target-priority",
          label: "直接目标优先",
          when: "用户明确询问、点名、选择候选回复目标，或上一位角色的问题明确指向某角色。",
          priority: 100,
          instruction:
            "被直接指向的角色必须优先被导演评估；若需要回应但不适合开口，应选择该 worker，并在 selectedInstruction 中要求只输出心理和可观察动作，不要改成旁白代替。只有完全无需近景反应时才不调度。",
        },
        {
          id: "goal-competes-for-user-attention",
          label: "目标竞争用户注意",
          when: "角色的个人任务、胜利条件、关系目标或当前人设目标与获得用户注意/好感/信任相关。",
          priority: 72,
          instruction:
            "即使用户没有点名，该角色也可以主动发言吸引用户注意，但不要每轮都抢话；根据人设克制程度决定是否加入。",
        },
        {
          id: "knowledge-holder-helps-or-misdirects",
          label: "知情者介入",
          when: "角色掌握与当前问题相关的公开事实、私有事实、阵营信息、线索或世界书知识。",
          priority: 68,
          instruction:
            "友好或守序角色倾向于补充帮助；有隐藏目标、敌对或欺骗动机的角色可误导、转移焦点或半真半假地发言，但不能泄露不该公开的事实。",
        },
        {
          id: "relationship-stakes",
          label: "关系利益相关",
          when: "当前发言会影响角色与用户或其他角色的好感、敌对、信任、承诺或竞争关系。",
          priority: 58,
          instruction: "关系利益越高，说话欲望越高；关系冷淡或无关的角色保持旁观或只做 ambient action。",
        },
        {
          id: "quiet-temperament-brake",
          label: "沉默人设刹车",
          when: "角色人设是寡言、谨慎、冷淡、观察者、守规矩，且没有被点名、没有关键事实、没有强利益相关。",
          priority: 25,
          instruction:
            "这类角色一般不应成为 selectedTargetId，可用 ambientAction artifact 表示弱在场；但如果被点名或需要近景非语言反应，可选择该 worker 并用角色动作完成本轮。",
        },
      ],
    },
    fixedOrder: {
      enabled: false,
      stopAfterRound: false,
      includeUser: false,
      userPosition: "first",
    },
    instruction: "",
  },
};
