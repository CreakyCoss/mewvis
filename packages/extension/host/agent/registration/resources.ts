import { isJsonValue } from "@earendil-works/chord";
import type {
  ExtensionTool,
  ExtensionToolResult,
  ExtensionCommand,
} from "@isle/extension-host";
import { z } from "zod";

const localName = z.string().regex(/^[a-z][a-z0-9_]{0,31}$/);
export const toolSchema = z
  .object({
    name: localName,
    label: z.string().min(1),
    description: z.string().min(1),
    parameters: z
      .record(z.string(), z.unknown())
      .refine(
        (schema) => schema.type === "object",
        "工具参数必须为 object schema",
      ),
    execute: z.custom<ExtensionTool["execute"]>(
      (value) => typeof value === "function",
    ),
  })
  .strict();
export const commandSchema = toolSchema.omit({ label: true }).extend({
  execute: z.custom<ExtensionCommand["execute"]>(
    (value) => typeof value === "function",
  ),
});
export const skillSchema = z
  .object({
    name: localName,
    description: z.string().min(1),
    content: z.string().min(1),
  })
  .strict();
const resultSchema = z
  .object({
    content: z.array(
      z.object({ type: z.literal("text"), text: z.string() }).strict(),
    ),
    details: z.unknown(),
  })
  .strict();

export function validateExtensionResult(value: unknown): ExtensionToolResult {
  if (!isJsonValue(value)) throw new Error("插件工具结果必须为 JSON");
  return resultSchema.parse(value) as ExtensionToolResult;
}
