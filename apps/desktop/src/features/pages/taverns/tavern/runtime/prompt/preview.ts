import type { TavernRuntimeRoom as TavernRoom } from "@/features/pages/taverns/room/model";
import type { TavernMessage, TavernReferencedFile } from "../../types";
import type {
  TavernCharacter,
  TavernPromptBlock,
  TavernPromptBlockTarget,
} from "@/features/pages/taverns/manage/model";
import type { TavernStoryContextPackage } from "@/features/pages/taverns/room/story-context";
import { isTavernFixedOrderPhase } from "../../core";
import { buildTavernDirectorPromptContext, buildTavernDirectorRuntimeInstruction } from "../director/prompt";
import { buildTavernReplyAgentRequest } from "../reply/request";
import { buildTavernBridgeSystemPrompt } from "./bridge/system-prompt";
import { buildTavernStoryContextPackage, getTavernRuntimeStoryProjection } from "@/features/pages/taverns/room/story-context";

export type TavernPromptPreviewTarget = TavernPromptBlockTarget;

export type TavernPromptPreviewWarningSeverity = "info" | "warning" | "danger";

export type TavernPromptPreviewWarningLocation =
  | {
      type: "prompt_block";
      blockId: string;
      target: TavernPromptBlockTarget;
      field: "label" | "text";
      label: string;
    }
  | {
      type: "room_field";
      field: string;
      label: string;
    }
  | {
      type: "lorebook_entry";
      entryId: string;
      field: "title" | "content" | "keywords";
      label: string;
    }
  | {
      type: "character_field";
      characterId: string;
      field: string;
      label: string;
    }
  | {
      type: "preview_target";
      target: TavernPromptPreviewTarget;
      label: string;
    };

export type TavernPromptPreviewWarning = {
  id: string;
  severity: TavernPromptPreviewWarningSeverity;
  target?: TavernPromptPreviewTarget;
  message: string;
  blocksSave?: boolean;
  locations?: TavernPromptPreviewWarningLocation[];
};

export type TavernPromptPreviewMetrics = {
  systemPromptChars: number;
  runtimeInstructionChars: number;
  requestContextChars: number;
  userMessageChars: number;
  totalChars: number;
};

export type TavernPromptPreviewItem = {
  target: TavernPromptPreviewTarget;
  label: string;
  systemPrompt: string;
  runtimeInstruction: string;
  requestContext: string;
  userMessage: string;
  fullPrompt: string;
  previewText: string;
  metrics: TavernPromptPreviewMetrics;
  warnings: TavernPromptPreviewWarning[];
};

export type TavernPromptPreviewSummary = {
  enabledPromptBlockCount: number;
  totalPromptBlockChars: number;
  warningCount: number;
  dangerCount: number;
  blockingWarningCount: number;
  totalChars: number;
};

export type TavernPromptPreview = {
  items: TavernPromptPreviewItem[];
  warnings: TavernPromptPreviewWarning[];
  summary: TavernPromptPreviewSummary;
  activeCharacter?: Pick<TavernCharacter, "id" | "name">;
};

export type BuildTavernPromptPreviewInput = {
  room: TavernRoom;
  characters?: TavernCharacter[];
  messages?: TavernMessage[];
  references?: TavernReferencedFile[];
  currentUserText?: string;
  selectedTargetCharacterIds?: string[];
  activeCharacterId?: string;
  storyContext?: TavernStoryContextPackage;
};

const previewCurrentUserText = "（预览）请按当前场景继续回应。";
const systemLikeTagPattern =
  /<\/?(?:system_contract|bridge_system_contract|presentation_profile|runtime_instruction|request_context|turn_instruction|prompt_block|interaction_quality_rule|output_schema|constraints|current_user_input|current_user_request|visible_turn_messages)\b/i;

const countText = (text: string, needle: string) => text.split(needle).length - 1;

const labelByTarget: Record<TavernPromptPreviewTarget, string> = {
  bridge: "整理员",
  director: "导演",
  character: "角色",
};

const createPromptBlockLocation = (
  block: TavernPromptBlock,
  field: "label" | "text" = "text",
): TavernPromptPreviewWarningLocation => ({
  type: "prompt_block",
  blockId: block.id,
  target: block.target,
  field,
  label: block.label,
});

const createRoomFieldLocation = (field: string, label: string): TavernPromptPreviewWarningLocation => ({
  type: "room_field",
  field,
  label,
});

const createLorebookEntryLocation = (
  entryId: string,
  field: "title" | "content" | "keywords",
  label: string,
): TavernPromptPreviewWarningLocation => ({
  type: "lorebook_entry",
  entryId,
  field,
  label,
});

const createCharacterFieldLocation = (
  characterId: string,
  field: string,
  label: string,
): TavernPromptPreviewWarningLocation => ({
  type: "character_field",
  characterId,
  field,
  label,
});

const createPreviewText = ({
  systemPrompt,
  runtimeInstruction,
  requestContext,
  userMessage,
}: {
  systemPrompt: string;
  runtimeInstruction: string;
  requestContext: string;
  userMessage: string;
}) =>
  [
    systemPrompt ? `# systemPrompt\n${systemPrompt}` : "",
    runtimeInstruction ? `# runtimeInstruction\n${runtimeInstruction}` : "",
    requestContext ? `# requestContext\n${requestContext}` : "",
    userMessage ? `# userMessage\n${userMessage}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

const createPreviewItem = ({
  target,
  systemPrompt = "",
  runtimeInstruction = "",
  requestContext = "",
  userMessage = "",
  warnings = [],
}: {
  target: TavernPromptPreviewTarget;
  systemPrompt?: string;
  runtimeInstruction?: string;
  requestContext?: string;
  userMessage?: string;
  warnings?: TavernPromptPreviewWarning[];
}): TavernPromptPreviewItem => {
  const fullPrompt = [systemPrompt, runtimeInstruction, requestContext, userMessage].filter(Boolean).join("\n\n");
  const metrics: TavernPromptPreviewMetrics = {
    systemPromptChars: systemPrompt.length,
    runtimeInstructionChars: runtimeInstruction.length,
    requestContextChars: requestContext.length,
    userMessageChars: userMessage.length,
    totalChars: fullPrompt.length,
  };

  return {
    target,
    label: labelByTarget[target],
    systemPrompt,
    runtimeInstruction,
    requestContext,
    userMessage,
    fullPrompt,
    previewText: createPreviewText({
      systemPrompt,
      runtimeInstruction,
      requestContext,
      userMessage,
    }),
    metrics,
    warnings,
  };
};

const getPreviewCharacters = (room: TavernRoom, characters?: TavernCharacter[]) =>
  characters?.length ? characters : getTavernRuntimeStoryProjection(room).characters;

const getPreviewActiveCharacter = ({
  room,
  characters,
  activeCharacterId,
}: {
  room: TavernRoom;
  characters: TavernCharacter[];
  activeCharacterId?: string;
}) => {
  const targetId = activeCharacterId ?? getTavernRuntimeStoryProjection(room).activeCharacterId;
  return characters.find((character) => character.id === targetId) ?? characters[0];
};

const getPreviewMaxSpeakers = (room: TavernRoom, characters: TavernCharacter[]) => {
  if (isTavernFixedOrderPhase(room)) {
    return Math.max(1, characters.length);
  }
  const configuredMaxSpeakers = Number.isFinite(room.settings.directorMaxSpeakers)
    ? room.settings.directorMaxSpeakers
    : 3;

  return Math.min(Math.max(1, configuredMaxSpeakers), Math.max(1, characters.length));
};

const buildSourceDuplicateWarnings = (room: TavernRoom): TavernPromptPreviewWarning[] => {
  const enabledBlocks = room.prompt.blocks.filter((block) => block.enabled && block.text.trim());
  const sourceKeyMap = new Map<string, typeof enabledBlocks>();
  const idMap = new Map<string, typeof enabledBlocks>();

  for (const block of enabledBlocks) {
    const sourceKey = block.source ? `${block.target}:${block.source.type}:${block.source.id}` : "";
    if (sourceKey) {
      sourceKeyMap.set(sourceKey, [...(sourceKeyMap.get(sourceKey) ?? []), block]);
    }
    idMap.set(block.id, [...(idMap.get(block.id) ?? []), block]);
  }

  return [
    ...[...idMap.entries()].flatMap(([blockId, blocks]) =>
      blocks.length > 1
        ? [
            {
              id: `duplicate-block-id:${blockId}`,
              severity: "danger" as const,
              blocksSave: true,
              target: blocks[0]?.target,
              message: `提示词块 id “${blockId}” 出现 ${blocks.length} 次，可能导致定位和保存混乱。`,
              locations: blocks.map((block) => createPromptBlockLocation(block, "label")),
            },
          ]
        : [],
    ),
    ...[...sourceKeyMap.entries()].flatMap(([sourceKey, blocks]) =>
      blocks.length > 1
        ? [
            {
              id: `duplicate-block-source:${sourceKey}`,
              severity: "warning" as const,
              target: blocks[0]?.target,
              message: `“${blocks[0]?.source?.label ?? sourceKey}” 在 ${labelByTarget[blocks[0]?.target ?? "character"]} 目标重复启用 ${blocks.length} 次。`,
              locations: blocks.map((block) => createPromptBlockLocation(block)),
            },
          ]
        : [],
    ),
  ];
};

const buildEditableTagWarnings = (room: TavernRoom, storyContext: TavernStoryContextPackage) => {
  const activeScene = storyContext.graph.activeScene;
  const characterMemoryText = (character: TavernStoryContextPackage["characters"][number]) => {
    const layers = character.memory;
    return [layers?.required, layers?.public, layers?.known, layers?.privateSelf]
      .map((value) => value?.trim())
      .filter(Boolean)
      .join("\n");
  };
  const candidates: Array<{
    id: string;
    label: string;
    text: string;
    target?: TavernPromptPreviewTarget;
    location?: TavernPromptPreviewWarningLocation;
  }> = [
    ...room.prompt.blocks
      .filter((block) => block.enabled && block.text.trim())
      .map((block) => ({
        id: `block:${block.id}`,
        label: `文本块“${block.label}”`,
        text: block.text,
        target: block.target,
        location: createPromptBlockLocation(block),
      })),
    { id: "room:title", label: "房间标题", text: room.title, location: createRoomFieldLocation("title", "房间标题") },
    {
      id: "room:storyOutline",
      label: "故事大纲",
      text: storyContext.story.outline,
      location: createRoomFieldLocation("storyOutline", "故事大纲"),
    },
    {
      id: "room:storyGoal",
      label: "故事目标",
      text: storyContext.story.goal,
      location: createRoomFieldLocation("storyGoal", "故事目标"),
    },
    {
      id: "room:scene",
      label: "当前场景",
      text: activeScene?.scene ?? "",
      location: createRoomFieldLocation("scene", "当前场景"),
    },
    {
      id: "room:scenePlot",
      label: "场景剧情",
      text: activeScene?.plot ?? "",
      location: createRoomFieldLocation("scenePlot", "场景剧情"),
    },
    {
      id: "room:sceneGoal",
      label: "场景目标",
      text: activeScene?.goal ?? "",
      location: createRoomFieldLocation("sceneGoal", "场景目标"),
    },
    {
      id: "room:sceneDirection",
      label: "场景方向",
      text: activeScene?.direction ?? "",
      location: createRoomFieldLocation("sceneDirection", "场景方向"),
    },
    {
      id: "room:sceneTransition",
      label: "场景转场",
      text: activeScene?.transition ?? "",
      location: createRoomFieldLocation("sceneTransition", "场景转场"),
    },
    {
      id: "room:memory",
      label: "长期记忆",
      text: storyContext.memory.manual,
      location: createRoomFieldLocation("memory", "长期记忆"),
    },
    ...storyContext.world.lorebookEntries.flatMap((entry) => [
      {
        id: `lore:${entry.id}:title`,
        label: `世界书“${entry.title}”标题`,
        text: entry.title,
        location: createLorebookEntryLocation(entry.id, "title", `世界书“${entry.title}”标题`),
      },
      {
        id: `lore:${entry.id}:content`,
        label: `世界书“${entry.title}”正文`,
        text: entry.content,
        location: createLorebookEntryLocation(entry.id, "content", `世界书“${entry.title}”正文`),
      },
      {
        id: `lore:${entry.id}:keywords`,
        label: `世界书“${entry.title}”关键词`,
        text: entry.keywords.join("\n"),
        location: createLorebookEntryLocation(entry.id, "keywords", `世界书“${entry.title}”关键词`),
      },
    ]),
    ...storyContext.characters.flatMap((character) => [
      {
        id: `character:${character.id}:name`,
        label: `角色“${character.name}”名称`,
        text: character.name,
        target: "character" as const,
        location: createCharacterFieldLocation(character.id, "name", `角色“${character.name}”名称`),
      },
      {
        id: `character:${character.id}:description`,
        label: `角色“${character.name}”设定`,
        text: character.description,
        target: "character" as const,
        location: createCharacterFieldLocation(character.id, "description", `角色“${character.name}”设定`),
      },
      {
        id: `character:${character.id}:speakingStyle`,
        label: `角色“${character.name}”说话风格`,
        text: character.speakingStyle,
        target: "character" as const,
        location: createCharacterFieldLocation(character.id, "speakingStyle", `角色“${character.name}”说话风格`),
      },
      {
        id: `character:${character.id}:writingStyle`,
        label: `角色“${character.name}”写作风格`,
        text: character.writingStyle ?? "",
        target: "character" as const,
        location: createCharacterFieldLocation(character.id, "writingStyle", `角色“${character.name}”写作风格`),
      },
      {
        id: `character:${character.id}:replyStylePrompt`,
        label: `角色“${character.name}”回复规则`,
        text: character.replyStylePrompt ?? "",
        target: "character" as const,
        location: createCharacterFieldLocation(character.id, "replyStylePrompt", `角色“${character.name}”回复规则`),
      },
      {
        id: `character:${character.id}:goals`,
        label: `角色“${character.name}”目标`,
        text: character.goals ?? "",
        target: "character" as const,
        location: createCharacterFieldLocation(character.id, "goals", `角色“${character.name}”目标`),
      },
      {
        id: `character:${character.id}:memory`,
        label: `角色“${character.name}”记忆`,
        text: characterMemoryText(character),
        target: "character" as const,
        location: createCharacterFieldLocation(character.id, "memory", `角色“${character.name}”记忆`),
      },
    ]),
  ];

  return candidates.flatMap(({ id, label, text, target, location }) =>
    systemLikeTagPattern.test(text)
      ? [
          {
            id: `editable-system-like-tag:${id}`,
            severity: "warning" as const,
            target,
            message: `${label} 含类似系统标签的文本；预览中会转义，但建议改写成普通自然语言。`,
            locations: location ? [location] : undefined,
          },
        ]
      : [],
  );
};

const buildLengthWarnings = (room: TavernRoom): TavernPromptPreviewWarning[] => {
  const enabledBlocks = room.prompt.blocks.filter((block) => block.enabled && block.text.trim());
  const totalPromptBlockChars = enabledBlocks.reduce((total, block) => total + block.text.length, 0);
  const warnings: TavernPromptPreviewWarning[] = [];

  for (const block of enabledBlocks) {
    if (block.text.length > 6000) {
      warnings.push({
        id: `long-block:${block.id}`,
        severity: "danger",
        blocksSave: true,
        target: block.target,
        message: `文本块“${block.label}”长度为 ${block.text.length} 字，已超过 6000 字保存上限。`,
        locations: [createPromptBlockLocation(block)],
      });
    }
  }

  if (totalPromptBlockChars > 22_000) {
    warnings.push({
      id: "large-prompt-block-total",
      severity: "warning",
      message: `启用文本块合计 ${totalPromptBlockChars} 字，后续请求上下文会偏重。`,
    });
  }

  return warnings;
};

const buildCoverageWarnings = (room: TavernRoom) => {
  const enabledTargets = new Set(
    room.prompt.blocks.filter((block) => block.enabled && block.text.trim()).map((block) => block.target),
  );

  return (["bridge", "director", "character"] as TavernPromptPreviewTarget[]).flatMap((target) =>
    enabledTargets.has(target)
      ? []
      : [
          {
            id: `empty-target:${target}`,
            severity: "info" as const,
            target,
            message: `${labelByTarget[target]} 目标没有启用的自定义文本块，将只使用系统合同和呈现规则。`,
            locations: [
              {
                type: "preview_target" as const,
                target,
                label: labelByTarget[target],
              },
            ],
          },
        ],
  );
};

const buildLayerInvariantWarnings = (characterItem: TavernPromptPreviewItem) => {
  const warnings: TavernPromptPreviewWarning[] = [];

  if (!characterItem.runtimeInstruction.includes("<system_contract")) {
    warnings.push({
      id: "character-system-contract-missing",
      severity: "danger",
      blocksSave: true,
      target: "character",
      message: "角色系统合同未出现在 runtimeInstruction 中，硬约束层级会变弱。",
      locations: [{ type: "preview_target", target: "character", label: "角色" }],
    });
  }

  if (characterItem.requestContext.includes("<system_contract")) {
    warnings.push({
      id: "character-system-contract-in-context",
      severity: "danger",
      blocksSave: true,
      target: "character",
      message: "角色系统合同出现在 data-only requestContext 中，应保持在 runtimeInstruction。",
      locations: [{ type: "preview_target", target: "character", label: "角色" }],
    });
  }

  if (characterItem.requestContext.includes("<turn_instruction>")) {
    warnings.push({
      id: "character-turn-instruction-in-context",
      severity: "danger",
      blocksSave: true,
      target: "character",
      message: "本轮指令出现在 data-only requestContext 中，容易被当作资料而非指令。",
      locations: [{ type: "preview_target", target: "character", label: "角色" }],
    });
  }

  return warnings;
};

const buildPromptBlockCountWarnings = (room: TavernRoom, items: TavernPromptPreviewItem[]) => {
  const itemByTarget = new Map(items.map((item) => [item.target, item]));

  return (["bridge", "director", "character"] as TavernPromptPreviewTarget[]).flatMap((target) => {
    const expectedCount = room.prompt.blocks.filter(
      (block) => block.enabled && block.target === target && block.text.trim(),
    ).length;
    const item = itemByTarget.get(target);
    const targetPromptText =
      target === "bridge"
        ? (item?.systemPrompt ?? "")
        : target === "director"
          ? (item?.requestContext ?? "")
          : (item?.runtimeInstruction ?? "");
    const actualCount = countText(targetPromptText, "<prompt_block ");

    if (actualCount === expectedCount) {
      return [];
    }

    return [
      {
        id: `prompt-block-count:${target}`,
        severity: "warning" as const,
        target,
        message: `${labelByTarget[target]} 目标预期注入 ${expectedCount} 个文本块，预览中出现 ${actualCount} 个。`,
        locations: [{ type: "preview_target" as const, target, label: labelByTarget[target] }],
      },
    ];
  });
};

const attachWarningsToItems = (items: TavernPromptPreviewItem[], warnings: TavernPromptPreviewWarning[]) =>
  items.map((item) => ({
    ...item,
    warnings: warnings.filter((warning) => warning.target === item.target),
  }));

export const buildTavernPromptPreview = ({
  room,
  characters,
  messages = [],
  references = [],
  currentUserText = previewCurrentUserText,
  selectedTargetCharacterIds = [],
  activeCharacterId,
  storyContext,
}: BuildTavernPromptPreviewInput): TavernPromptPreview => {
  const previewCharacters = getPreviewCharacters(room, characters);
  const previewStoryContext =
    storyContext ??
    buildTavernStoryContextPackage({
      room,
      characters: previewCharacters,
    });
  const activeCharacter = getPreviewActiveCharacter({
    room,
    characters: previewCharacters,
    activeCharacterId,
  });
  const bridgeSystemPrompt = buildTavernBridgeSystemPrompt(room);
  const bridgeItem = createPreviewItem({
    target: "bridge",
    systemPrompt: bridgeSystemPrompt,
  });

  const directorPromptContext = buildTavernDirectorPromptContext({
    room,
    characters: previewCharacters,
    messages,
    references,
    currentUserText,
    turnTrigger: { type: "user" },
    selectedTargetCharacterIds,
    maxSpeakers: getPreviewMaxSpeakers(room, previewCharacters),
    storyContext: previewStoryContext,
  });
  const directorItem = createPreviewItem({
    target: "director",
    systemPrompt: bridgeSystemPrompt,
    runtimeInstruction: buildTavernDirectorRuntimeInstruction(directorPromptContext),
    requestContext: directorPromptContext.requestContext,
    userMessage: "请决定本轮酒馆对话的发言顺序和可选在场动作，并只输出严格合法 JSON。",
  });

  const characterItem = activeCharacter
    ? (() => {
        const request = buildTavernReplyAgentRequest({
          room,
          activeCharacter,
          characters: previewCharacters,
          messages,
          references,
          currentUserText,
          turnInstruction: "预览当前角色请求层级；真实运行时会替换为当轮角色任务。",
          storyContext: previewStoryContext,
        });

        return createPreviewItem({
          target: "character",
          systemPrompt: request.systemPrompt,
          runtimeInstruction: request.runtimeInstruction ?? "",
          requestContext: request.requestContext,
          userMessage: request.userMessage,
        });
      })()
    : createPreviewItem({
        target: "character",
        warnings: [
          {
            id: "missing-character",
            severity: "warning",
            blocksSave: false,
            target: "character",
            message: "当前房间没有可预览角色，无法生成角色 Agent 最终请求。",
            locations: [{ type: "preview_target", target: "character", label: "角色" }],
          },
        ],
      });
  const initialItems = [bridgeItem, directorItem, characterItem];
  const warnings = [
    ...buildLengthWarnings(room),
    ...buildSourceDuplicateWarnings(room),
    ...buildEditableTagWarnings(room, previewStoryContext),
    ...buildCoverageWarnings(room),
    ...buildLayerInvariantWarnings(characterItem),
    ...buildPromptBlockCountWarnings(room, initialItems),
    ...characterItem.warnings,
    ...initialItems.flatMap((item) =>
      item.metrics.totalChars > 32_000
        ? [
            {
              id: `large-preview:${item.target}`,
              severity: "warning" as const,
              target: item.target,
              message: `${item.label} 预览合计 ${item.metrics.totalChars} 字，建议检查是否有过长资料或重复文本块。`,
              locations: [{ type: "preview_target" as const, target: item.target, label: item.label }],
            },
          ]
        : [],
    ),
  ];
  const items = attachWarningsToItems(initialItems, warnings);
  const enabledPromptBlocks = room.prompt.blocks.filter((block) => block.enabled && block.text.trim());

  return {
    items,
    warnings,
    summary: {
      enabledPromptBlockCount: enabledPromptBlocks.length,
      totalPromptBlockChars: enabledPromptBlocks.reduce((total, block) => total + block.text.length, 0),
      warningCount: warnings.filter((warning) => warning.severity === "warning").length,
      dangerCount: warnings.filter((warning) => warning.severity === "danger").length,
      blockingWarningCount: warnings.filter((warning) => warning.severity === "danger" && warning.blocksSave !== false)
        .length,
      totalChars: items.reduce((total, item) => total + item.metrics.totalChars, 0),
    },
    activeCharacter: activeCharacter
      ? {
          id: activeCharacter.id,
          name: activeCharacter.name,
        }
      : undefined,
  };
};
