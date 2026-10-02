import type { JsonObject } from "@mewvis/extension-sdk";
import { avatarIds, type AvatarId } from "./avatars";

export type Role = {
  id: string;
  name: string;
  instructions: string;
  avatar: AvatarId;
};
export function roles(config: Readonly<JsonObject>): Role[] {
  const values = (config.roles ?? []) as unknown as Role[];
  if (!Array.isArray(values) || values.length > 64)
    throw new Error("最多配置 64 个协作角色");
  const ids = new Set<string>();
  for (const role of values) {
    if (
      !role ||
      typeof role.id !== "string" ||
      !/^[a-z][a-z0-9_]{0,63}$/.test(role.id) ||
      ids.has(role.id)
    )
      throw new Error("协作角色标识无效或重复");
    if (
      typeof role.name !== "string" ||
      !role.name.trim() ||
      role.name.length > 64
    )
      throw new Error("请填写协作角色名称（最多 64 字）");
    if (
      typeof role.instructions !== "string" ||
      !role.instructions.trim() ||
      role.instructions.length > 8000
    )
      throw new Error("请填写角色职责（最多 8000 字）");
    if (!avatarIds.includes(role.avatar))
      throw new Error("请选择插件提供的角色头像");
    ids.add(role.id);
  }
  return structuredClone(values);
}
export function rolePrompt(role: Role) {
  return `你是${role.name}。\n${role.instructions}`;
}
