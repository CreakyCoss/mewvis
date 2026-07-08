export const TAVERN_ROOM_PROMPT_XML_TAGS = {
  activeCharacter: "active_character",
  branchPrivateMemory: "branch_private_memory",
  branchPublicMemory: "branch_public_memory",
  characters: "characters",
  currentUserInput: "current_user_input",
  directorOperationPolicy: "director_operation_policy",
  directorSecretMemory: "director_secret_memory",
  finalGoal: "final_goal",
  generatedReply: "generated_reply",
  loreEntry: "lore_entry",
  lorebook: "lorebook",
  presentationProfile: "presentation_profile",
  promptBlock: "prompt_block",
  publicVisibleMessages: "public_visible_messages",
  recentConversation: "recent_conversation",
  room: "room",
  roomMemory: "room_memory",
  roomScene: "room_scene",
  sceneDirection: "scene_direction",
  sceneDriveDirective: "scene_drive_directive",
  sceneDriveGuidance: "scene_drive_guidance",
  sceneGoal: "scene_goal",
  scenePlot: "scene_plot",
  sceneStatus: "scene_status",
  sceneTransition: "scene_transition",
  secretMemoryProtocol: "secret_memory_protocol",
  selectedReplyTargets: "selected_reply_targets",
  storyArc: "story_arc",
  storyGraph: "story_graph",
} as const;

type TavernRoomPromptXmlTagName = (typeof TAVERN_ROOM_PROMPT_XML_TAGS)[keyof typeof TAVERN_ROOM_PROMPT_XML_TAGS];

type TavernRoomPromptXmlAttributeValue = string | number | boolean | null | undefined;

type TavernRoomPromptXmlAttributes = Record<string, TavernRoomPromptXmlAttributeValue>;

type TavernRoomPromptXmlTextMode = "escaped" | "raw";

type TavernRoomPromptXmlItem = {
  tag?: TavernRoomPromptXmlTagName;
  text: string;
  attributes?: TavernRoomPromptXmlAttributes;
  emptyText?: string;
  maxChars?: number;
  textMode?: TavernRoomPromptXmlTextMode;
  enabled?: boolean;
};

type TavernRoomPromptXmlListItem = TavernRoomPromptXmlItem | false | null | undefined;

const limitPromptXmlText = (text: string, maxChars: number) => {
  const trimmed = text.trim();
  return trimmed.length <= maxChars ? trimmed : `${trimmed.slice(0, maxChars)}...`;
};

const escapePromptXmlText = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const escapePromptXmlAttribute = (text: string) => escapePromptXmlText(text).replace(/"/g, "&quot;");

const formatPromptXmlAttributes = (attributes?: TavernRoomPromptXmlAttributes) => {
  const attributeText = Object.entries(attributes ?? {})
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `${key}="${escapePromptXmlAttribute(String(value))}"`)
    .join(" ");

  return attributeText ? ` ${attributeText}` : "";
};

const formatPromptXmlItem = ({
  tag,
  text,
  attributes,
  emptyText = "（无）",
  maxChars,
  textMode = "escaped",
}: TavernRoomPromptXmlItem) => {
  if (!tag) {
    return text;
  }

  const rawBody = text.trim() ? text : emptyText;
  const limitedBody = typeof maxChars === "number" ? limitPromptXmlText(rawBody, maxChars) : rawBody;
  const body = textMode === "raw" ? limitedBody : escapePromptXmlText(limitedBody);
  const attributeText = formatPromptXmlAttributes(attributes);

  return body.includes("\n")
    ? `<${tag}${attributeText}>\n${body}\n</${tag}>`
    : `<${tag}${attributeText}>${body}</${tag}>`;
};

const isEnabledPromptXmlItem = (item: TavernRoomPromptXmlListItem): item is TavernRoomPromptXmlItem =>
  item !== false && item !== null && item !== undefined && item.enabled !== false;

export const formatTavernRoomPromptXml = (items: TavernRoomPromptXmlListItem[]) =>
  items.filter(isEnabledPromptXmlItem).map(formatPromptXmlItem).join("\n");
