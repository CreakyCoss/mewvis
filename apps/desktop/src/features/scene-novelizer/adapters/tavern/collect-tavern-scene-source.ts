import {
  filterTavernFactEventsForAudience,
} from "@/features/pages/taverns/tavern/core";
import {
  createTavernRenderableMessages,
} from "@/features/pages/taverns/tavern/message";
import type {
  TavernCharacter,
  TavernMessage,
  TavernMessageSegment,
  TavernRoom,
} from "@/features/pages/taverns/tavern/types";
import {
  DEFAULT_SCENE_NOVELIZER_PLATFORM_ID,
} from "../../prompt-registry/packages";
import {
  getDefaultSceneNovelizerRuleOptionIds,
} from "../../prompt-registry/rule-options";
import type {
  SceneNovelMaterialBeat,
  SceneNovelMaterialKind,
  SceneNovelMaterialVisibility,
  SceneNovelSource,
  SceneNovelizerPlatformStyleId,
} from "../../types";

const textSnippet = (text: string, maxChars = 240) => {
  const trimmed = text.trim().replace(/\n{3,}/g, "\n\n");
  return trimmed.length > maxChars ? `${trimmed.slice(0, maxChars)}...` : trimmed;
};

const containsAny = (text: string, patterns: RegExp[]) =>
  patterns.some((pattern) => pattern.test(text));

const consequencePatterns = [
  /(?:于是|因此|只好|立刻|随即|终于|导致|换来|逼得|不得不|来不及|已经|变成|暴露|失去|锁死|受伤|惊动|追来|逼近)/,
];

const interruptionPatterns = [
  /(?:忽然|突然|门外|窗外|脚步|敲门|撞|闩|灯灭|火光|警报|钟声|有人来了|追兵|雨声变大|闯入)/,
];

const hookPatterns = [
  /(?:真相|铜牌|令牌|名单|钥匙|老板娘|东口|后门|路线|失踪|血|追兵|势力|规矩|代价|身份|下一步|来不及)/,
];

const quotedDialoguePattern = /["“「『]([^"”」』]{2,120})["”」』]/g;

const getCharacterName = (
  characterById: Map<string, TavernCharacter>,
  characterId?: string,
) => characterId ? characterById.get(characterId)?.name : undefined;

const visibilityForSegment = (
  segment: TavernMessageSegment,
): SceneNovelMaterialVisibility =>
  segment.type === "thought" && segment.visibility === "private"
    ? "character_private"
    : "public";

const kindForSegment = (
  segment: TavernMessageSegment,
  messageRole: TavernMessage["role"],
): SceneNovelMaterialKind => {
  if (messageRole === "user") {
    return "user_action";
  }

  if (segment.type === "dialogue") {
    return "dialogue";
  }

  if (segment.type === "action") {
    return "action";
  }

  if (segment.type === "thought") {
    return "thought";
  }

  return messageRole === "narrator" ? "narration" : "action";
};

const tagsForText = (text: string) => [
  containsAny(text, consequencePatterns) ? "consequence" : "",
  containsAny(text, interruptionPatterns) ? "interruption" : "",
  containsAny(text, hookPatterns) ? "hook" : "",
].filter(Boolean);

const specializeKindByTags = (
  baseKind: SceneNovelMaterialKind,
  tags: string[],
): SceneNovelMaterialKind => {
  if (baseKind === "narration" || baseKind === "action") {
    if (tags.includes("interruption")) {
      return "interruption";
    }
    if (tags.includes("consequence")) {
      return "consequence";
    }
    if (tags.includes("hook")) {
      return "hook";
    }
  }

  return baseKind;
};

const createMaterial = ({
  id,
  turnIndex,
  source,
  kind,
  visibility,
  text,
  characterId,
  characterName,
  speakerName,
  sourceMessageIds,
  tags,
  turnId,
}: SceneNovelMaterialBeat): SceneNovelMaterialBeat => ({
  id,
  turnIndex,
  source,
  kind,
  visibility,
  text: text.trim(),
  characterId,
  characterName,
  speakerName,
  sourceMessageIds,
  tags,
  turnId,
});

const extractQuotedDialogueMaterials = ({
  text,
  messageId,
  turnId,
  turnIndex,
  characterId,
  characterName,
  speakerName,
}: {
  text: string;
  messageId: string;
  turnId?: string;
  turnIndex: number;
  characterId?: string;
  characterName?: string;
  speakerName?: string;
}) => {
  const materials: SceneNovelMaterialBeat[] = [];
  for (const match of text.matchAll(quotedDialoguePattern)) {
    const quote = match[1]?.trim();
    if (!quote) {
      continue;
    }

    materials.push(createMaterial({
      id: `${messageId}-quote-${materials.length + 1}`,
      turnId,
      turnIndex,
      source: "character",
      kind: "dialogue",
      visibility: "public",
      text: quote,
      characterId,
      characterName,
      speakerName,
      sourceMessageIds: [messageId],
      tags: ["quoted-dialogue"],
    }));
  }

  return materials;
};

const summarizeSceneStatus = (room: TavernRoom) => [
  room.sceneStatus?.location ? `地点：${room.sceneStatus.location}` : "",
  room.sceneStatus?.timeLabel ? `时间：${room.sceneStatus.timeLabel}` : "",
  room.sceneStatus?.weather ? `天气：${room.sceneStatus.weather}` : "",
  room.sceneStatus?.atmosphere ? `氛围：${room.sceneStatus.atmosphere}` : "",
  room.sceneStatus?.scenePhase ? `阶段：${room.sceneStatus.scenePhase}` : "",
  room.sceneStatus?.immediateThreat ? `威胁：${room.sceneStatus.immediateThreat}` : "",
].filter(Boolean).join("；");

const buildStats = (materials: SceneNovelMaterialBeat[]) => ({
  userActionCount: materials.filter((item) => item.kind === "user_action").length,
  characterBeatCount: materials.filter((item) => item.source === "character").length,
  dialogueCount: materials.filter((item) => item.kind === "dialogue").length,
  thoughtCount: materials.filter((item) => item.kind === "thought").length,
  consequenceCount: materials.filter((item) =>
    item.kind === "consequence" || item.tags?.includes("consequence")
  ).length,
  hookCount: materials.filter((item) =>
    item.kind === "hook" || item.tags?.includes("hook")
  ).length,
});

export const collectTavernSceneNovelSource = ({
  room,
  messages,
  characters,
  platformStyleId = DEFAULT_SCENE_NOVELIZER_PLATFORM_ID,
}: {
  room: TavernRoom;
  messages: TavernMessage[];
  characters: TavernCharacter[];
  platformStyleId?: SceneNovelizerPlatformStyleId;
}): SceneNovelSource => {
  const characterById = new Map(characters.map((character) => [character.id, character]));
  const renderableMessages = createTavernRenderableMessages({
    messages,
    characters,
    userPersonaName: room.userPersonaName,
    room,
  }).filter((message) => message.status !== "streaming" && message.status !== "error");
  const messageTurnIndexes = new Map<string, number>();
  let turnIndex = 0;

  for (const message of renderableMessages) {
    if (message.role === "user") {
      turnIndex += 1;
    }
    messageTurnIndexes.set(message.id, Math.max(turnIndex, 1));
  }

  const materials = renderableMessages.flatMap((message) => {
    const currentTurnIndex = messageTurnIndexes.get(message.id) ?? 1;
    const characterName = getCharacterName(characterById, message.characterId);
    const baseSource = message.role === "user"
      ? "user"
      : message.role === "narrator" ? "director" : "character";
    const segmentMaterials = message.segments.flatMap((segment, index) => {
      const text = segment.text.trim();
      if (!text) {
        return [];
      }

      const tags = tagsForText(text);
      const kind = specializeKindByTags(
        kindForSegment(segment, message.role),
        tags,
      );
      const material = createMaterial({
        id: `${message.id}-${index}`,
        turnId: message.source.turnId,
        turnIndex: currentTurnIndex,
        source: baseSource,
        kind,
        visibility: visibilityForSegment(segment),
        text,
        characterId: message.characterId,
        characterName,
        speakerName: message.speakerName,
        sourceMessageIds: [message.id],
        tags,
      });
      const quotedMaterials = message.role === "character" && segment.type === "narration"
        ? extractQuotedDialogueMaterials({
            text,
            messageId: message.id,
            turnId: message.source.turnId,
            turnIndex: currentTurnIndex,
            characterId: message.characterId,
            characterName,
            speakerName: message.speakerName,
          })
        : [];

      return [material, ...quotedMaterials];
    });

    if (segmentMaterials.length > 0) {
      return segmentMaterials;
    }

    const text = message.content.trim();
    if (!text) {
      return [];
    }

    const tags = tagsForText(text);
    return [createMaterial({
      id: `${message.id}-content`,
      turnId: message.source.turnId,
      turnIndex: currentTurnIndex,
      source: baseSource,
      kind: specializeKindByTags(message.role === "user" ? "user_action" : "narration", tags),
      visibility: "public",
      text,
      characterId: message.characterId,
      characterName,
      speakerName: message.speakerName,
      sourceMessageIds: [message.id],
      tags,
    })];
  });

  const visibleFacts = filterTavernFactEventsForAudience({
    factEvents: room.factEvents,
    room,
    audience: { type: "user" },
  }).filter((factEvent) => factEvent.visibleToUser === true || factEvent.visibility === "public");
  const unresolvedHooks = [
    ...room.pendingInteractions
      .filter((interaction) => interaction.status === "open")
      .map((interaction) => interaction.text),
    room.sceneStatus?.immediateThreat,
    room.sceneGoal,
  ].filter((value): value is string => Boolean(value?.trim()));

  return {
    id: `${room.id}-${room.activeSceneId ?? room.id}-${messages.length}`,
    title: room.title,
    platformStyleId,
    ruleOptionIds: getDefaultSceneNovelizerRuleOptionIds(platformStyleId),
    sceneSummary: textSnippet(room.scene || room.storyOutline || room.title, 360),
    sceneGoal: textSnippet(room.sceneGoal || room.storyGoal || "", 240),
    sceneStatus: summarizeSceneStatus(room),
    userPersonaName: room.userPersonaName,
    materials,
    confirmedFacts: visibleFacts.slice(-16).map((factEvent) => factEvent.evidence),
    unresolvedHooks: Array.from(new Set(unresolvedHooks.map((hook) => textSnippet(hook, 160)))).slice(-8),
    constraints: {
      preserveUserActions: true,
      noNewKeyConclusion: true,
      thoughtMode: "user_visible_only",
      targetChars: 1200,
      paragraphMaxChars: platformStyleId === "fanqie" ? 160 : 180,
    },
    stats: buildStats(materials),
    createdAt: Date.now(),
  };
};
