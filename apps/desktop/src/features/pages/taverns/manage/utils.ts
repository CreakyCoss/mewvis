import type {
  TavernPromptBlock,
  TavernReplyMode,
  TavernRoom,
  TavernRoomSettings,
} from "@/features/pages/taverns/manage/model";

export const replyModeOptions: Array<{
  value: TavernReplyMode;
  label: string;
}> = [{ value: "director", label: "导演调度" }];

export const formatCount = (value: number, label: string) => `${value} ${label}`;

export const emptyValueText = "未设置";

export const editorControlClassName = "w-full bg-background/80 shadow-none";

export const getReplyModeLabel = (replyMode: TavernReplyMode) =>
  replyModeOptions.find((option) => option.value === replyMode)?.label ?? "导演调度";

export const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "未知错误";
};

const cloneTavernDirectorProfile = (
  profile: TavernRoomSettings["directorScheduling"]["profile"],
): TavernRoomSettings["directorScheduling"]["profile"] =>
  profile
    ? {
        ...profile,
        globalGoals: [...profile.globalGoals],
        globalRules: [...profile.globalRules],
        characterProfiles: Object.fromEntries(
          Object.entries(profile.characterProfiles).map(([characterId, characterProfile]) => [
            characterId,
            {
              ...characterProfile,
              interestTags: [...characterProfile.interestTags],
              goalTags: [...characterProfile.goalTags],
              knowledgeTags: [...characterProfile.knowledgeTags],
              speechTriggers: [...characterProfile.speechTriggers],
              silenceTriggers: [...characterProfile.silenceTriggers],
            },
          ]),
        ),
      }
    : undefined;

export const cloneTavernRoomSettings = (settings: TavernRoomSettings): TavernRoomSettings => ({
  immersiveDescriptionEnabled: settings.immersiveDescriptionEnabled,
  directorMaxSpeakers: settings.directorMaxSpeakers,
  directorLoop: { ...settings.directorLoop },
  interactionQualityRuleIds: [...settings.interactionQualityRuleIds],
  directorNarrativeControl: { ...settings.directorNarrativeControl },
  directorScheduling: {
    ...settings.directorScheduling,
    speakerMotivation: {
      ...settings.directorScheduling.speakerMotivation,
      rules: settings.directorScheduling.speakerMotivation.rules.map((rule) => ({ ...rule })),
    },
    profile: cloneTavernDirectorProfile(settings.directorScheduling.profile),
    fixedOrder: {
      ...settings.directorScheduling.fixedOrder,
    },
  },
});

const cloneTavernPromptBlock = (block: TavernPromptBlock): TavernPromptBlock => ({
  ...block,
  source: block.source ? { ...block.source } : undefined,
});

export const cloneTavernRoom = (room: TavernRoom): TavernRoom => ({
  ...room,
  presentation: { ...room.presentation },
  prompt: {
    version: 1,
    blocks: room.prompt.blocks.map(cloneTavernPromptBlock),
  },
  settings: cloneTavernRoomSettings(room.settings),
});

export const prepareTavernRoomForSave = (room: TavernRoom): TavernRoom => cloneTavernRoom(room);
