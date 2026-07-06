import type { TavernMessage } from "../../types";
import type { TavernCharacter, TavernFactEvent, TavernRoom } from "@/features/pages/taverns/manage/model";
import { normalizeTavernMessageForAudience, type TavernVisibleMessage } from "./visibility";
import { filterTavernFactEventsForAudience, shouldShowTavernCharacterThoughts } from "../../core/information-policy";
import { buildTavernMessageSegments } from "./segments";

export type TavernRenderableMessage = TavernVisibleMessage & {
  source: TavernMessage;
  userVisibleFactEvents?: TavernFactEvent[];
};

const sortByMessageOrder = (a: TavernMessage, b: TavernMessage, messageOrderById: Map<string, number>) =>
  (messageOrderById.get(a.id) ?? 0) - (messageOrderById.get(b.id) ?? 0);

const getEntityCharacterId = (entity: TavernFactEvent["actor"]) =>
  entity?.type === "character" ? entity.characterId : undefined;

const entityIsUser = (entity: TavernFactEvent["actor"]) => entity?.type === "user";

const resolveFactEventAnchorMessageId = ({
  factEvent,
  messageById,
  messageOrderById,
}: {
  factEvent: TavernFactEvent;
  messageById: Map<string, TavernMessage>;
  messageOrderById: Map<string, number>;
}) => {
  const sourceMessages = factEvent.sourceMessageIds
    .flatMap((messageId) => {
      const message = messageById.get(messageId);
      return message ? [message] : [];
    })
    .sort((a, b) => sortByMessageOrder(a, b, messageOrderById));

  if (sourceMessages.length === 0) {
    return null;
  }

  const actorCharacterId = getEntityCharacterId(factEvent.actor);
  const targetCharacterId = getEntityCharacterId(factEvent.target);
  const preferredCharacterId = actorCharacterId ?? targetCharacterId;
  const characterMessage = preferredCharacterId
    ? sourceMessages.find((message) => message.role === "character" && message.characterId === preferredCharacterId)
    : undefined;
  if (characterMessage) {
    return characterMessage.id;
  }

  const userMessage =
    entityIsUser(factEvent.actor) || entityIsUser(factEvent.target)
      ? sourceMessages.find((message) => message.role === "user")
      : undefined;
  if (userMessage) {
    return userMessage.id;
  }

  return sourceMessages[0]?.id ?? null;
};

const createUserVisibleFactEventsByMessageId = ({
  messages,
  room,
}: {
  messages: TavernMessage[];
  room?: Pick<TavernRoom, "settings" | "outcomeEvents" | "factEvents">;
}) => {
  const factsByMessageId = new Map<string, TavernFactEvent[]>();
  if (!room) {
    return factsByMessageId;
  }

  const messageById = new Map(messages.map((message) => [message.id, message]));
  const messageOrderById = new Map(messages.map((message, index) => [message.id, index]));
  const userVisibleFactEvents = filterTavernFactEventsForAudience({
    factEvents: room.factEvents,
    room,
    audience: { type: "user" },
  })
    .filter((factEvent) => factEvent.visibleToUser === true)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));

  for (const factEvent of userVisibleFactEvents) {
    const anchorMessageId = resolveFactEventAnchorMessageId({
      factEvent,
      messageById,
      messageOrderById,
    });
    if (!anchorMessageId) {
      continue;
    }

    factsByMessageId.set(anchorMessageId, [...(factsByMessageId.get(anchorMessageId) ?? []), factEvent]);
  }

  return factsByMessageId;
};
const normalizeNarratorEchoText = (text: string) =>
  text.toLowerCase().replace(/[\s*_`~"'“”‘’「」『』《》【】（）()[\]{}<>.,，。!?！？;；:：、—\-]/g, "");

const isNarratorEchoReply = (replyText: string, narratorTexts: string[]) => {
  const normalizedReply = normalizeNarratorEchoText(replyText);

  return (
    normalizedReply.length > 0 &&
    narratorTexts.some((narratorText) => normalizeNarratorEchoText(narratorText) === normalizedReply)
  );
};

const narratorEnvironmentSubjectPattern =
  /^(?:热汤机|噪声|灯(?:光)?|门|舱门|舷窗|屏幕|频道|频段|补给站|酒馆|吧台|圆桌|空气|风|雨|雾|雪|火(?:盆)?|钟|影子|光线|冷藏柜|地板|墙面|舰桥|船舱|走廊|大厅|房间|窗外|门外|夜色|沉默|广播|警报|引擎|电流|蒸汽|纸页|档案|木匣|牌面|杯沿|灯火|炉火|水汽|寒意|潮气|金属|机器|系统|环境)/;
const narratorEnvironmentMotionPattern =
  /(?:压低|沉下|低沉|回荡|响起|停住|晃动|闪烁|亮起|暗下|落下|浮出|渗出|掠过|侧耳|屏息|等待|安静|静了|静下来)/;
const characterIntentPattern =
  /(?:我|你|您|咱|需要|知道|认为|确定|确认|决定|可以|不能|不会|必须|别|请|问|答|说|记得|退场|授权|失踪|航线|结局|核心|流程)/;
const characterBodyActionPattern =
  /(?:指下|手|掌|袖口|胸口|眼|嘴角|肩|背|脚|步|抬|放|抽出|摸|推|拿|递|看|笑|皱眉|点头|摇头)/;

const isLikelyNarratorOnlyCharacterMessage = (
  message: TavernRenderableMessage,
  characters: TavernCharacter[],
  userPersonaName: string,
) => {
  if (message.role !== "character" || message.status === "streaming" || message.status === "error") {
    return false;
  }

  const content = message.content.trim();
  if (
    content.length < 8 ||
    content.length > 90 ||
    content.includes("\n") ||
    /[?？]/.test(content) ||
    /[*_`]/.test(content)
  ) {
    return false;
  }

  const labels = [userPersonaName, ...characters.map((character) => character.name)]
    .map((label) => label.trim())
    .filter(Boolean);
  if (labels.some((label) => content.includes(label))) {
    return false;
  }

  if (characterIntentPattern.test(content) || characterBodyActionPattern.test(content)) {
    return false;
  }

  return narratorEnvironmentSubjectPattern.test(content) && narratorEnvironmentMotionPattern.test(content);
};

export const createTavernRenderableMessages = ({
  messages,
  characters,
  userPersonaName,
  room,
}: {
  messages: TavernMessage[];
  characters: TavernCharacter[];
  userPersonaName: string;
  room?: Pick<TavernRoom, "settings" | "outcomeEvents" | "factEvents">;
}): TavernRenderableMessage[] => {
  const turnNarratorTexts: string[] = [];
  const includeAllThoughts = room
    ? shouldShowTavernCharacterThoughts({
        settings: room.settings,
        outcomeEvents: room.outcomeEvents,
      })
    : true;
  const userVisibleFactEventsByMessageId = createUserVisibleFactEventsByMessageId({
    messages,
    room,
  });
  const renderableMessages = messages.map((message) => ({
    ...normalizeTavernMessageForAudience({
      message,
      characters,
      userPersonaName,
      audience: { type: "ui", includeAllThoughts },
    }),
    source: message,
    ...(userVisibleFactEventsByMessageId.has(message.id)
      ? { userVisibleFactEvents: userVisibleFactEventsByMessageId.get(message.id) }
      : {}),
  }));

  return renderableMessages.flatMap((message) => {
    if (message.role === "user") {
      turnNarratorTexts.length = 0;
      return [message];
    }

    if (message.role === "narrator") {
      turnNarratorTexts.push(message.content);
      return [message];
    }

    if (isNarratorEchoReply(message.content, turnNarratorTexts)) {
      return [];
    }

    if (isLikelyNarratorOnlyCharacterMessage(message, characters, userPersonaName)) {
      const narratorMessage: TavernRenderableMessage = {
        ...message,
        role: "narrator",
        characterId: undefined,
        speakerName: "旁白",
        segments: buildTavernMessageSegments({
          role: "narrator",
          content: message.content,
          thought: undefined,
          presentationProfileId: message.source.presentationProfileId,
        }),
        thought: undefined,
        source: {
          ...message.source,
          role: "narrator",
          characterId: undefined,
          thought: undefined,
          content: message.content,
        },
      };
      turnNarratorTexts.push(narratorMessage.content);
      return [narratorMessage];
    }

    return [message];
  });
};
