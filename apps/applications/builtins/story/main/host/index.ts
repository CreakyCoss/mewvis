import { defineApplication } from "@mewvis/app-sdk";
import { createStoryRegistry } from "./registry.js";

export default defineApplication({
  name: "@mewvis/story",
  inject: ["tools", "skills", "workspaces", "storage"],
  apply(ctx) {
    if (!ctx.workspaces) throw new Error("故事应用需要应用工作区服务");
    const registry = createStoryRegistry(ctx);
    for (const tool of registry.tools) ctx.tools.register(tool);
    for (const skill of registry.skills) ctx.skills.register(skill);
  },
});
