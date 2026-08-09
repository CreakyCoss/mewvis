import assert from "node:assert/strict";
import { build } from "esbuild";
import { resolve } from "node:path";

const root = process.cwd();
const entry = resolve(root, "src/features/pages/stories/story/actions/assistant/conversation.ts");
const output = await build({
  entryPoints: [entry],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  write: false,
});
const { latestStoryAssistantChatId } = await import(
  `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`
);

assert.equal(latestStoryAssistantChatId([]), null, "没有历史聊天时应回退创建新会话");
assert.equal(
  latestStoryAssistantChatId([
    { id: "newly-created", createdAt: 300, updatedAt: 300 },
    { id: "last-used", createdAt: 100, updatedAt: 500 },
  ]),
  "last-used",
  "应恢复最近实际更新的聊天，而不是最近创建但未继续的聊天",
);
assert.equal(
  latestStoryAssistantChatId([
    { id: "older-created", createdAt: 100, updatedAt: 500 },
    { id: "newer-created", createdAt: 200, updatedAt: 500 },
  ]),
  "newer-created",
  "更新时间相同时应以创建时间稳定决胜",
);

console.log("[story-assistant-chat] ok");
