import type { TavernStoryContextPackage } from "@/features/pages/tavern/adapters/story";
import type {
  TavernCharacter,
  TavernMessage,
  TavernRoom,
} from "../../../types";
import {
  SUGGESTION_COUNT,
  buildTavernUserReplyConversationSections,
  buildTavernUserReplySceneSections,
  formatPendingInteractionsForPrompt,
} from "./context";

export const buildTavernUserReplySuggestionPrompt = ({
  room,
  characters,
  messages,
  currentDraft,
  storyContext,
}: {
  room: TavernRoom;
  characters: TavernCharacter[];
  messages: TavernMessage[];
  currentDraft?: string;
  storyContext?: TavernStoryContextPackage;
}) => {
  const characterList = characters.map((character) =>
    `id: ${character.id}\nname: ${character.name}\ndescription: ${character.description}`
  ).join("\n");
  const suggestionCount = Math.max(1, Math.min(
    room.settings.replyOptions.count || SUGGESTION_COUNT,
    5,
  ));
  const pendingInteractions = formatPendingInteractionsForPrompt(room, characters);
  const prompt = [
    "<task>",
    `为酒馆用户「${room.userPersonaName || "我"}」生成 ${suggestionCount} 个下一句回复候选。`,
    "</task>",
    "",
    "<rules>",
    "候选必须是用户可以直接发送的一句话或一小段话。",
    "不要替角色说话，不要写角色动作，不要输出角色名加冒号。",
    "每个候选都要能推动当前场景，但风格可以不同：追问、试探、行动决定。",
    "每条候选建议 12 到 60 个中文字符；字符串内容不要自带引号、编号或列表符号。",
    "如果 pending_interactions 中有 target=user 的事项，优先生成回应它的候选，respondsToInteractionId 填对应 id，targetCharacterIds 填提问角色 id。",
    "如果用户是在主动询问某些角色，targetCharacterIds 填这些角色 id；如果是面向全场或行动决定，可填空数组。",
    "intent 只能是 answer、ask、act、interrupt、wait、inspect 之一。",
    currentDraft?.trim()
      ? "已有用户草稿时，以补全、改写或延展草稿意图为主，不要完全偏离草稿。"
      : "",
    "只输出严格合法 JSON 对象，不要 Markdown、代码块或解释。",
    "</rules>",
    "",
    "<output_schema>",
    `{"replies":[{"text":"候选 1","targetCharacterIds":["character-id"],"respondsToInteractionId":"可选 pending id","intent":"ask"}]}`,
    "</output_schema>",
    "",
    ...buildTavernUserReplySceneSections({ room, characters, storyContext }),
    "",
    "<characters>",
    characterList,
    "</characters>",
    "",
    "<pending_interactions>",
    pendingInteractions,
    "</pending_interactions>",
    "",
    currentDraft?.trim()
      ? `<current_user_draft>\n${currentDraft.trim()}\n</current_user_draft>`
      : "",
    "",
    ...buildTavernUserReplyConversationSections({ room, characters, messages }),
  ].filter(Boolean).join("\n");

  return {
    prompt,
    suggestionCount,
  };
};
