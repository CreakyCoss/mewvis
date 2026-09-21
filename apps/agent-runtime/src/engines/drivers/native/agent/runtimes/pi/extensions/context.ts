import type { ContextEvent } from "@earendil-works/pi-coding-agent";
import type { ExtensionContextMessage } from "@isle/extension-sdk";
import { randomUUID } from "node:crypto";

/** Native messages never leave this adapter. References preserve signatures, images and tool metadata. */
export function projectPiContext(messages: ContextEvent["messages"]) {
  const originals = structuredClone(messages);
  const requestId = randomUUID();
  const projected: ExtensionContextMessage[] = originals.map((message, index) => {
    const content = "content" in message ? message.content : undefined;
    const text =
      typeof content === "string"
        ? content
        : Array.isArray(content) && content.every((block) => block.type === "text")
          ? content.map((block) => (block as { text: string }).text).join("")
          : undefined;
    return {
      id: `${requestId}:${index}`,
      role:
        message.role === "user" || message.role === "assistant"
          ? message.role
          : message.role === "toolResult"
            ? "tool"
            : "other",
      ...(text === undefined ? {} : { text }),
    };
  });
  return {
    messages: projected,
    restore(items: ExtensionContextMessage[]): ContextEvent["messages"] {
      return items.map((item) => {
        if (!item.id) return { role: "user", content: item.text!, timestamp: Date.now() };
        const index = projected.findIndex((message) => message.id === item.id);
        if (index < 0 || projected[index].role !== item.role) throw new Error("无效的 Pi 上下文引用");
        const original = originals[index];
        if (item.text === projected[index].text) return original;
        if (projected[index].text === undefined || item.text === undefined) throw new Error("不支持改写非文本 Pi 消息");
        return {
          ...original,
          content:
            typeof (original as { content?: unknown }).content === "string"
              ? item.text
              : [{ type: "text", text: item.text }],
        } as ContextEvent["messages"][number];
      });
    },
  };
}
