import type { ChatMeta } from "@/api/chat";
import { orderBy } from "lodash-es";

type StoryAssistantChatMeta = Pick<ChatMeta, "id" | "createdAt" | "updatedAt">;

/** 进入创作助手时恢复最近实际使用的会话，而不是按创建时间误选新但未继续的会话。 */
export const latestStoryAssistantChatId = (chats: readonly StoryAssistantChatMeta[]) =>
  orderBy(chats, ["updatedAt", "createdAt", "id"], ["desc", "desc", "desc"])[0]?.id ?? null;
