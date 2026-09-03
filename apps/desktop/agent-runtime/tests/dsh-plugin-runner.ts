import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPiResourceLoader } from "../src/engines/drivers/native/agent/runtimes/pi/agent/resources.js";
import { allowedRuntimeTools, runtimeResourcesFor } from "../src/engines/drivers/native/agent/runtimes/resources.js";
import type { RuntimeAgentCommand } from "../src/engines/drivers/native/agent/runtimes/types.js";

const pluginUrl = process.env.ISLE_DSH_RUNTIME_PLUGIN_URL;
assert.ok(pluginUrl, "测试必须提供 Isle 内部 DSH 小说插件入口 URL。");
const pluginRoot = process.env.ISLE_DSH_RUNTIME_PLUGIN_ROOT;
assert.ok(pluginRoot, "测试必须提供 Isle 内部 DSH 小说插件根目录。");
const rssPluginUrl = process.env.ISLE_DSH_RUNTIME_RSS_PLUGIN_URL;
assert.ok(rssPluginUrl, "测试必须提供 Isle 内部 RSS 插件入口 URL。");
const rssPluginRoot = process.env.ISLE_DSH_RUNTIME_RSS_PLUGIN_ROOT;
assert.ok(rssPluginRoot, "测试必须提供 Isle 内部 RSS 插件根目录。");
const tavernPluginUrl = process.env.ISLE_DSH_RUNTIME_TAVERN_PLUGIN_URL;
assert.ok(tavernPluginUrl, "测试必须提供 Isle 内部酒馆插件入口 URL。");
const tavernPluginRoot = process.env.ISLE_DSH_RUNTIME_TAVERN_PLUGIN_ROOT;
assert.ok(tavernPluginRoot, "测试必须提供 Isle 内部酒馆插件根目录。");
const storyDeslopUrl = process.env.ISLE_DSH_RUNTIME_STORY_DESLOP_URL;
assert.ok(storyDeslopUrl, "测试必须提供 story-deslop DSH 插件入口 URL。");
const storyDeslopRoot = process.env.ISLE_DSH_RUNTIME_STORY_DESLOP_ROOT;
assert.ok(storyDeslopRoot, "测试必须提供 story-deslop DSH 插件根目录。");

const workspacePath = await mkdtemp(join(tmpdir(), "isle-dsh-runtime-workspace-"));
const pluginSettingsRoot = join(workspacePath, "plugin-settings");
const command: RuntimeAgentCommand = {
  runtimeMode: "agent",
  taskId: "dsh-runtime-test",
  workspacePath,
  userMessage: "设计一个场景",
  agentTaskPrompt: "设计一个场景",
  resources: {
    tools: { allowed: [] },
    skills: { enabled: [] },
    plugins: {
      settingsPath: pluginSettingsRoot,
      dsh: [
        {
          id: "@isle/story-scene-card",
          specifier: pluginUrl,
          packageRoot: pluginRoot,
          packageName: "@isle/story-scene-card",
          patchPath: join(pluginRoot, "cordis.patch.yml"),
        },
        {
          id: "@isle/story-deslop",
          specifier: storyDeslopUrl,
          packageRoot: storyDeslopRoot,
          packageName: "@isle/story-deslop",
          patchPath: join(storyDeslopRoot, "cordis.patch.yml"),
        },
        {
          id: "@isle/rss-reader",
          specifier: rssPluginUrl,
          packageRoot: rssPluginRoot,
          packageName: "@isle/rss-reader",
          patchPath: join(rssPluginRoot, "cordis.patch.yml"),
        },
        {
          id: "@isle/tavern",
          specifier: tavernPluginUrl,
          packageRoot: tavernPluginRoot,
          packageName: "@isle/tavern",
          patchPath: join(tavernPluginRoot, "cordis.patch.yml"),
        },
      ],
    },
  },
};

assert.deepEqual(allowedRuntimeTools(command), []);
assert.equal(runtimeResourcesFor(command).plugins?.dsh?.[0]?.id, "@isle/story-scene-card");
assert.equal(runtimeResourcesFor(command).plugins?.settingsPath, pluginSettingsRoot);

const resources = await createPiResourceLoader(command, {
  requestUserInput: async () => "",
});
let materializedSkillPath = "";

try {
  assert.equal(resources.pluginToolNames.includes("isle_story_scene_card"), true);
  assert.equal(resources.pluginToolNames.includes("rss_fetch"), true);
  assert.equal(resources.pluginToolNames.includes("tavern_context"), true);
  const extensionResult = resources.loader.getExtensions();
  assert.deepEqual(extensionResult.errors, []);
  const registeredTools = extensionResult.extensions.flatMap((extension) => [...extension.tools.values()]);
  const registered = registeredTools.find((tool) => tool.definition.name === "isle_story_scene_card");
  assert.ok(registered, "DSH 工具必须注册到 Pi Agent 扩展层。");

  const skills = resources.loader.getSkills().skills;
  const skill = skills.find((candidate) => candidate.name === "isle-story-scene-card");
  assert.ok(skill, "DSH Skill 必须进入 Pi Skill 目录。");
  materializedSkillPath = skill.filePath;
  assert.equal(skill.disableModelInvocation, false);
  assert.match(skill.sourceInfo.source, /^dsh-plugin:/);
  assert.match(readFileSync(skill.filePath, "utf8"), /isle_story_scene_card/);
  const storyDeslop = skills.find((candidate) => candidate.name === "story-deslop");
  assert.ok(storyDeslop, "迁移后的 story-deslop 必须作为 DSH Skill 进入 Pi Skill 目录。");
  assert.equal(storyDeslop.disableModelInvocation, false);
  assert.match(readFileSync(storyDeslop.filePath, "utf8"), /核心信念/);
  assert.ok(existsSync(join(storyDeslop.baseDir, "references", "banned-words.md")));
  const rssReader = skills.find((candidate) => candidate.name === "isle-rss-reader");
  assert.ok(rssReader, "RSS 插件技能必须进入 Pi Skill 目录。");
  assert.match(readFileSync(rssReader.filePath, "utf8"), /不可信内容/);
  const tavern = skills.find((candidate) => candidate.name === "isle-tavern");
  assert.ok(tavern, "酒馆插件技能必须进入 Pi Skill 目录。");
  assert.match(readFileSync(tavern.filePath, "utf8"), /tavern_context/);

  const result = await registered.definition.execute(
    "dsh-pi-call-1",
    {
      goal: "拿到账本",
      conflict: "守卫提前封锁仓库",
      stakes: "同伴会被当作内鬼处置",
      turn: "账本早已被调包",
    },
    undefined,
    undefined,
    undefined as never,
  );
  assert.equal(result.content[0]?.type, "text");
  assert.match(result.content[0]?.type === "text" ? result.content[0].text : "", /账本早已被调包/);
  assert.deepEqual((result.details as { value: { goal: string } }).value.goal, "拿到账本");

  await assert.rejects(
    () =>
      registered.definition.execute(
        "dsh-pi-call-2",
        { goal: "拿到账本", conflict: "守卫封锁仓库" },
        undefined,
        undefined,
        undefined as never,
      ),
    /stakes/,
    "DSH 参数校验错误必须穿过 Pi 适配层。",
  );
} finally {
  await resources.dispose();
  await rm(workspacePath, { recursive: true, force: true });
}

assert.ok(materializedSkillPath);
assert.equal(existsSync(materializedSkillPath), false, "Session 释放后必须清理临时 Skill 文件。");
console.log("[agent-runtime:dsh-compat] ok");
