import { TAVERN_PROMPT_STYLE_PRESETS } from "../../../prompt-styles";
import { TAVERN_PRESENTATION_PROFILE_OPTIONS } from "../../../prompt-registry/presentation-rules";
import { TAVERN_SYSTEM_NARRATIVE_PRESET_OPTIONS } from "../../../prompt-registry/system-narrative-styles";

const promptStyleIdsSchema = TAVERN_PROMPT_STYLE_PRESETS.map((preset) => preset.id).join(" | ");
const presentationProfileIdsSchema = TAVERN_PRESENTATION_PROFILE_OPTIONS.map((profile) =>
  profile.id
).join(" | ");
const systemNarrativePresetIdsSchema = TAVERN_SYSTEM_NARRATIVE_PRESET_OPTIONS
  .map((preset) => preset.id)
  .join(" | ");

export const generatedPresetSchema = `{
  "version": 1,
  "label": "给用户看的短名称",
  "description": "一句话说明玩法",
  "room": {
    "title": "酒馆标题",
    "presentation": { "profileId": "${presentationProfileIdsSchema}", "profileVersion": 1 },
    "promptStyleId": "${promptStyleIdsSchema}",
    "storyOutline": "背景故事摘要",
    "storyGoal": "场景长期目标",
    "scene": "第一幕公开环境",
    "sceneGoal": "当前幕目标",
    "plot": "当前幕冲突和推进线索",
    "storyDirection": "导演后续调度方向",
    "memory": "已知前情，初始可为空",
    "userPersonaName": "用户称呼",
    "settings": {
      "directorMaxSpeakers": 3,
      "directorScheduling": {
        "targetedReplyPolicy": "director | prefer | include | exclusive",
        "maxExtraSpeakersOnTargetedReply": 2,
        "allowDirectorOnly": false,
        "directorOnlyPhaseStatusId": "",
        "directorOnlyPhaseValues": [],
        "speakerMotivation": {
          "enabled": true,
          "maxMotivatedSpeakers": 2,
          "rules": [
            {
              "id": "short-rule-id",
              "label": "规则名",
              "when": "什么上下文会提高或降低说话欲望",
              "priority": 60,
              "instruction": "导演如何根据这个规则决定发言/动作/沉默"
            }
          ]
        },
        "profile": {
          "version": 1,
          "source": "generated",
          "globalGoals": ["全局调度目标"],
          "globalRules": ["稳定玩法调度规则"],
          "characterProfiles": {
            "stable-short-id": {
              "characterId": "stable-short-id",
              "temperament": "稳定性格调度摘要",
              "speechBias": "very_low | low | balanced | high | very_high",
              "nonverbalBias": "very_low | low | balanced | high | very_high",
              "interestTags": ["感兴趣内容"],
              "goalTags": ["个人局内目标关键词"],
              "knowledgeTags": ["常掌握或关注的知识/线索"],
              "conflictStyle": "冲突处理方式",
              "socialStrategy": "社交/竞争策略",
              "speechTriggers": ["什么情况更想说话"],
              "silenceTriggers": ["什么情况更倾向沉默或动作回应"],
              "notes": "导演调度时的稳定补充"
            }
          }
        },
        "fixedOrder": { "enabled": false, "phaseStatusId": "", "phaseValues": [], "stopAfterRound": false, "includeUser": false, "userPosition": "first | last" },
        "autoContinuation": "enabled | disabled | disabledForFixedOrder",
        "instruction": "阶段制/点名/固定顺序等调度规则"
      },
      "systemNarrativePreset": { "presetId": "${systemNarrativePresetIdsSchema}", "customInstructions": "" },
      "replyOptions": { "enabled": true, "count": 3 },
      "statusTracking": { "enabled": true, "visibleToUser": true },
      "randomEvents": { "enabled": false, "probability": 0.15 },
      "illustrationHints": { "enabled": false },
      "informationPolicy": {
        "mode": "open | mystery | social_deduction | custom",
        "uiDefaultView": "public | reveal | director",
        "hideCharacterThoughts": false,
        "revealThoughts": "manual | sceneOutcome | never",
        "hiddenFacts": { "enabled": false, "defaultVisibility": "director", "reveal": "manual | sceneOutcome | never" },
        "roleAssignment": {
          "enabled": false,
          "strategy": "manual | director_random",
          "includeUser": true,
          "revealToAssignedCharacter": true,
          "revealFactionMembers": true,
          "opening": {
            "autoStart": false,
            "publicEventType": "",
            "publicEventValue": "",
            "globalStatusPatches": []
          },
          "rolePool": [
            { "id": "wolf", "label": "狼人", "description": "夜间同阵营行动", "factionId": "wolves", "factionLabel": "狼人阵营", "count": 1 }
          ]
        }
      }
    },
    "lorebookEntries": [
      { "title": "世界书条目", "content": "只写稳定设定", "keywords": ["关键词"], "alwaysOn": false }
    ],
    "factEvents": [
      {
        "type": "role_assignment | clue_found | hidden_truth",
        "target": { "type": "character", "characterId": "stable-short-id" },
        "evidence": "结构化事实内容",
        "confidence": 1,
        "visibility": "public | private | director | hidden",
        "visibleToUser": false,
        "visibleToCharacterIds": ["stable-short-id"],
        "visibleToFactionIds": ["wolves"],
        "revealWhen": "manual | sceneOutcome | never"
      }
    ],
    "statusDefinitions": [],
    "statusRules": [],
    "progressViews": [],
    "taskDefinitions": [],
    "sceneOutcomes": []
  },
  "characters": [
    {
      "id": "stable-short-id",
      "name": "角色名",
      "avatar": "",
      "description": "人设、动机、边界",
      "speakingStyle": "对白风格",
      "writingStyle": "叙事动作和神态风格",
      "replyStylePrompt": "该角色每轮回复的额外约束",
      "goals": "角色目标",
      "relationships": [
        {
          "id": "relationship-short-id",
          "target": { "type": "user" },
          "label": "与用户的稳定基础关系",
          "attitude": "稳定态度",
          "publicNote": "公开可见的关系说明",
          "privateNote": "角色私下判断，可省略",
          "tags": ["关系关键词"],
          "updatedAt": 0
        }
      ],
      "memory": "该角色初始已知信息",
      "publicStatus": {},
      "privateStatus": {}
    }
  ],
  "messages": [
    { "role": "narrator", "content": "开场旁白" }
  ]
}`;

export const promptStyleOptionsText = () =>
  TAVERN_PROMPT_STYLE_PRESETS
    .map((preset) => `- ${preset.id}: ${preset.label}。${preset.description}`)
    .join("\n");
