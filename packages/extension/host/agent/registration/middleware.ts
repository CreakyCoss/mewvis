import { isJsonValue } from "@earendil-works/chord";
import type {
  ExtensionMiddlewareData,
  ExtensionMiddlewareOutcome,
  ExtensionMiddlewareType,
} from "@isle/extension-host";
import { z } from "zod";

const object = z.record(z.string(), z.custom(isJsonValue));
const text = z.object({ text: z.string() }).strict();
const identity = { callId: z.string().min(1), toolName: z.string().min(1) };
const schemas = {
  session_compact: z
    .object({
      operationId: z.string().min(1),
      reason: z.enum(["manual", "threshold", "overflow"]),
      willRetry: z.boolean(),
      instructions: z.string().nullable(),
      tokensBefore: z.number().nonnegative(),
    })
    .strict(),
  input: text,
  system_prompt: text,
  context: z
    .object({
      messages: z.array(
        z
          .object({
            id: z.string().min(1).optional(),
            role: z.enum(["user", "assistant", "tool", "other"]),
            text: z.string().optional(),
          })
          .strict(),
      ),
    })
    .strict(),
  tool_call: z.object({ ...identity, input: object }).strict(),
  tool_result: z
    .object({
      ...identity,
      result: z
        .object({
          content: z.array(
            z.discriminatedUnion("type", [
              z.object({ type: z.literal("text"), text: z.string() }).strict(),
              z
                .object({
                  type: z.literal("image"),
                  data: z.string(),
                  mimeType: z.string().min(1),
                })
                .strict(),
            ]),
          ),
          details: z.custom(isJsonValue),
          isError: z.boolean(),
        })
        .strict(),
    })
    .strict(),
};
export const middlewareTypes = Object.keys(
  schemas,
) as ExtensionMiddlewareType[];
const outcomeSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("continue"), value: z.unknown() }).strict(),
  z
    .object({ action: z.literal("block"), reason: z.string().trim().min(1) })
    .strict(),
]);

export function validateMiddlewareOutcome<T extends ExtensionMiddlewareType>(
  type: T,
  input: ExtensionMiddlewareData[T],
  reply: unknown,
): ExtensionMiddlewareOutcome<T> {
  const outcome = outcomeSchema.parse(reply);
  if (type === "session_compact" && outcome.action === "continue") {
    const value = validateMiddlewareData(type, outcome.value);
    if (
      JSON.stringify(value) !==
      JSON.stringify(validateMiddlewareData(type, input))
    )
      throw new Error("压缩前钩子不能修改压缩请求");
    return { action: "continue", value };
  }
  return applyMiddlewareResult(
    type,
    input,
    outcome.action === "block"
      ? outcome
      : { action: "replace", value: outcome.value },
  );
}

export function validateMiddlewareData<T extends ExtensionMiddlewareType>(
  type: T,
  value: unknown,
): ExtensionMiddlewareData[T] {
  if (!Object.hasOwn(schemas, type) || !isJsonValue(value))
    throw new Error("无效的插件中间件数据");
  return schemas[type].parse(value) as ExtensionMiddlewareData[T];
}

/** Validate before committing the handler's state transaction, including immutable native references. */
export function applyMiddlewareResult<T extends ExtensionMiddlewareType>(
  type: T,
  input: ExtensionMiddlewareData[T],
  reply: unknown,
): ExtensionMiddlewareOutcome<T> {
  const decision = z
    .discriminatedUnion("action", [
      z.object({ action: z.literal("continue") }).strict(),
      z.object({ action: z.literal("replace"), value: z.unknown() }).strict(),
      z
        .object({
          action: z.literal("block"),
          reason: z.string().trim().min(1),
        })
        .strict(),
    ])
    .parse(reply);
  if (decision.action === "block") {
    if (type !== "input" && type !== "tool_call" && type !== "session_compact")
      throw new Error(`中间件 ${type} 不支持 block`);
    return decision;
  }
  if (type === "session_compact" && decision.action === "replace")
    throw new Error("压缩前钩子仅支持 continue 或 block");
  const value =
    decision.action === "continue"
      ? structuredClone(input)
      : validateMiddlewareData(type, decision.value);
  if (type === "tool_call" || type === "tool_result") {
    const before = input as ExtensionMiddlewareData[
      "tool_call" | "tool_result"];
    const after = value as typeof before;
    if (after.callId !== before.callId || after.toolName !== before.toolName)
      throw new Error("中间件不能修改工具调用身份");
  }
  if (type === "context") {
    const before = new Map(
      (input as ExtensionMiddlewareData["context"]).messages
        .filter((m) => m.id)
        .map((m) => [m.id, m]),
    );
    const seen = new Set<string>();
    for (const message of (value as ExtensionMiddlewareData["context"])
      .messages) {
      if (!message.id) {
        if (message.role !== "user" || message.text === undefined)
          throw new Error("新增上下文消息必须为 user 文本");
        continue;
      }
      const original = before.get(message.id);
      if (!original || seen.has(message.id) || original.role !== message.role)
        throw new Error("无效或重复的上下文消息引用");
      if ((original.text === undefined) !== (message.text === undefined))
        throw new Error("不能替换非文本上下文内容或删除 text 字段");
      seen.add(message.id);
    }
  }
  return { action: "continue", value };
}
