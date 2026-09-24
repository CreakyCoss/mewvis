import type { ChatMessage } from "@/chat/core";

/** Suppress only an empty coordinator placeholder once it has delegated output. */
export function visibleMessages(messages: ChatMessage[]): ChatMessage[] {
  const parents = new Set(
    messages.flatMap((message) =>
      message.role === "assistant" && message.parentMessageId ? [message.parentMessageId] : [],
    ),
  );
  return messages.filter(
    (message) =>
      message.role !== "assistant" ||
      !parents.has(message.id) ||
      !["loading", "streaming"].includes(message.status ?? "") ||
      message.blocks.some((block) => block.type === "tool" || block.content.trim()),
  );
}

export function messageAvatarSource(avatar: string | undefined, builtin: (id: string) => string) {
  if (!avatar) return undefined;
  if (/^(https?:\/\/|data:image\/)/i.test(avatar)) return avatar;
  return builtin(avatar);
}
