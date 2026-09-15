import { nonempty, invalid } from "./validation.js";
export function sessionId(value: unknown): string {
  const id = nonempty(value, "id").replace(/(?:\.json)+$/, "");
  if (!id || /[/\\\0]/.test(id) || id.includes("..") || id.startsWith("."))
    invalid("记录 ID 不合法");
  return id;
}
