import type {
  TavernPromptBlock,
  TavernReplyMode,
  TavernRoleAssignmentDefinition,
  TavernRoom,
  TavernRoomSettings,
} from "@/features/pages/taverns/manage/model";

export const replyModeOptions: Array<{
  value: TavernReplyMode;
  label: string;
}> = [{ value: "director", label: "导演调度" }];

export const formatCount = (value: number, label: string) => `${value} ${label}`;

export const emptyValueText = "未设置";

export const getUnknownErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "操作失败，请稍后重试。";
};

export const parseKeywords = (value: string) =>
  value
    .split(/[,，\n]/)
    .map((keyword) => keyword.trim())
    .filter(Boolean);

export const editorControlClassName = "w-full bg-background/80 shadow-none";
export const settingsFlagGridClassName = "grid grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] gap-2";
export const settingsEditorMetricGridClassName = "grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3";

export const focusRoomEditorElementById = (elementId: string | undefined, delayMs = 80) => {
  if (!elementId || typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  window.setTimeout(() => {
    const element = document.getElementById(elementId) as HTMLElement | null;
    if (!element) {
      return;
    }

    element.scrollIntoView({ block: "center", behavior: "smooth" });
    window.requestAnimationFrame(() => {
      element.focus({ preventScroll: true });
    });
  }, delayMs);
};

export const getReplyModeLabel = (replyMode: TavernReplyMode) =>
  replyModeOptions.find((option) => option.value === replyMode)?.label ?? "导演调度";

type ProgressJsonParseResult<T> = { ok: true; value: T[] } | { ok: false; error: string };

export const formatProgressJson = (value: unknown) => JSON.stringify(value, null, 2);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const hasStringField = (value: Record<string, unknown>, field: string) =>
  typeof value[field] === "string" && value[field].trim().length > 0;

export const parseProgressJsonArray = <T>(
  raw: string,
  label: string,
  guard: (item: unknown) => item is T,
): ProgressJsonParseResult<T> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: `${label}不是有效 JSON。` };
  }

  if (!Array.isArray(parsed)) {
    return { ok: false, error: `${label}必须是数组。` };
  }

  const invalidIndex = parsed.findIndex((item) => !guard(item));
  if (invalidIndex >= 0) {
    return { ok: false, error: `${label}第 ${invalidIndex + 1} 项缺少必要字段。` };
  }

  const seenIds = new Set<string>();
  const duplicatedItem = parsed.find((item) => {
    const id = isRecord(item) && typeof item.id === "string" ? item.id.trim() : "";
    if (!id) {
      return false;
    }
    if (seenIds.has(id)) {
      return true;
    }
    seenIds.add(id);
    return false;
  });
  if (duplicatedItem && isRecord(duplicatedItem) && typeof duplicatedItem.id === "string") {
    return { ok: false, error: `${label}存在重复 id：${duplicatedItem.id}` };
  }

  return { ok: true, value: parsed };
};

export const isRoleAssignmentDefinitionDraft = (item: unknown): item is TavernRoleAssignmentDefinition =>
  isRecord(item) &&
  hasStringField(item, "id") &&
  hasStringField(item, "label") &&
  (item.count === undefined || typeof item.count === "number");

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
  ...settings,
  interactionQualityRuleIds: [...settings.interactionQualityRuleIds],
  directorNarrativeControl: { ...settings.directorNarrativeControl },
  directorLoop: { ...settings.directorLoop },
  continuation: { ...settings.continuation },
  replyOptions: { ...settings.replyOptions },
  randomEvents: { ...settings.randomEvents },
  illustrationHints: { ...settings.illustrationHints },
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
  informationPolicy: {
    ...settings.informationPolicy,
    hiddenFacts: { ...settings.informationPolicy.hiddenFacts },
    roleAssignment: {
      ...settings.informationPolicy.roleAssignment,
      opening: {
        ...settings.informationPolicy.roleAssignment.opening,
      },
      rolePool: settings.informationPolicy.roleAssignment.rolePool.map((role) => ({ ...role })),
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

export const applyInformationPolicyModePreset = (
  mode: TavernRoomSettings["informationPolicy"]["mode"],
  current: TavernRoomSettings["informationPolicy"],
): TavernRoomSettings["informationPolicy"] => {
  if (mode === "open") {
    return {
      ...current,
      mode,
      uiDefaultView: "reveal",
      hideCharacterThoughts: false,
      revealThoughts: "manual",
      hiddenFacts: {
        ...current.hiddenFacts,
        enabled: false,
        reveal: "manual",
      },
      roleAssignment: {
        ...current.roleAssignment,
        enabled: false,
        strategy: "manual",
        rolePool: current.roleAssignment.rolePool.map((role) => ({ ...role })),
      },
    };
  }

  return {
    ...current,
    mode,
    uiDefaultView: "public",
    hideCharacterThoughts: true,
    revealThoughts: "manual",
    hiddenFacts: {
      ...current.hiddenFacts,
      enabled: true,
      defaultVisibility: "director",
      reveal: "manual",
    },
    roleAssignment: {
      ...current.roleAssignment,
      enabled: mode === "social_deduction" ? true : current.roleAssignment.enabled,
      strategy: mode === "social_deduction" ? "director_random" : current.roleAssignment.strategy,
      includeUser: mode === "social_deduction" ? true : current.roleAssignment.includeUser,
      rolePool: current.roleAssignment.rolePool.map((role) => ({ ...role })),
    },
  };
};
