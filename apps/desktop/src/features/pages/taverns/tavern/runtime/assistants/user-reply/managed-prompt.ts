import type { TavernStoryContextPackage } from "@/features/pages/taverns/tavern/adapters/story";
import type {
  TavernCharacter,
  TavernMessage,
  TavernRoom,
} from "../../../types";
import {
  buildTavernUserReplyConversationSections,
  buildTavernUserReplySceneSections,
} from "./context";

export const buildTavernManagedUserReplyPrompt = ({
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
    `${character.name}: ${character.description}`
  ).join("\n");

  return [
    "<task>",
    `以导演身份，为酒馆用户「${room.userPersonaName || "我"}」调度并生成本轮要发送的回复。`,
    "</task>",
    "",
    "<rules>",
    "reply 必须是用户可以直接发送的一句话或一小段话。",
    "reply 不可为空，也不可只输出 reason；即使信息不足，也要生成一句谨慎的追问或推进决定。",
    "reply 绝对不能包含 <function_calls>、<tool_calls>、XML/HTML 标签、工具调用、JSON 代码块或系统标记。",
    "只替用户说话，不要替酒馆角色说话，不要写角色动作，不要输出角色名加冒号。",
    "回复需要承接当前对话和场景目标，能自然推动下一轮角色回应。",
    "避免连续输出“嗯”“好”“继续守着”这类低信息短句；等待场景里也要给出一个具体观察点、轮报要求或下一步检查指令。",
    "可以包含用户的行动决定、追问、试探或态度，但不要越过当前剧情直接解决核心谜题。",
    "建议 20 到 120 个中文字符；内容不要自带引号、编号或列表符号。",
    currentDraft?.trim()
      ? "用户输入框里的文字是托管方向提示，请吸收其意图；如果其中明确点名角色、发言顺序、人数或限制，必须保留这些硬约束，但不要机械照抄措辞。"
      : "没有方向提示时，根据当前剧情自动选择最合理、最有戏剧张力的一句回复。",
    "只输出严格合法 JSON 对象，不要 Markdown、代码块或解释。",
    "</rules>",
    "",
    "<output_schema>",
    `{"reply":"用户本轮要发送的回复","reason":"可选简短调度原因"}`,
    "</output_schema>",
    "",
    ...buildTavernUserReplySceneSections({ room, characters, storyContext }),
    "",
    "<characters>",
    characterList,
    "</characters>",
    "",
    currentDraft?.trim()
      ? `<managed_direction_hint>\n${currentDraft.trim()}\n</managed_direction_hint>`
      : "",
    "",
    ...buildTavernUserReplyConversationSections({ room, characters, messages }),
  ].filter(Boolean).join("\n");
};

export const buildTavernManagedUserReplySystemPrompt = () => [
  "你是酒馆模式的全托管导演。",
  "你负责代用户生成下一句可发送回复，让剧情自然继续。",
  "reply 字段必须非空，且不得包含工具调用、函数调用、XML/HTML 标签或系统标记。",
  "只输出符合 schema 的严格合法 JSON 对象，不要代码块。",
].join("\n");
