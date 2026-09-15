import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPiResourceLoader } from "../src/engines/drivers/native/agent/runtimes/pi/agent/resources.js";
import { allowedRuntimeTools, runtimeResourcesFor } from "../src/engines/drivers/native/agent/runtimes/resources.js";
import type { RuntimeAgentCommand } from "../src/engines/drivers/native/agent/runtimes/types.js";

const applicationUrl = process.env.ISLE_DSH_RUNTIME_APPLICATION_URL;
assert.ok(applicationUrl, "测试必须提供 Isle 内部 DSH 小说应用入口 URL。");
const applicationRoot = process.env.ISLE_DSH_RUNTIME_APPLICATION_ROOT;
assert.ok(applicationRoot, "测试必须提供 Isle 内部 DSH 小说应用根目录。");
const rssApplicationUrl = process.env.ISLE_DSH_RUNTIME_RSS_APPLICATION_URL;
assert.ok(rssApplicationUrl, "测试必须提供 Isle 内部 RSS 应用入口 URL。");
const rssApplicationRoot = process.env.ISLE_DSH_RUNTIME_RSS_APPLICATION_ROOT;
assert.ok(rssApplicationRoot, "测试必须提供 Isle 内部 RSS 应用根目录。");
const tavernApplicationUrl = process.env.ISLE_DSH_RUNTIME_TAVERN_APPLICATION_URL;
assert.ok(tavernApplicationUrl, "测试必须提供 Isle 内部酒馆应用入口 URL。");
const tavernApplicationRoot = process.env.ISLE_DSH_RUNTIME_TAVERN_APPLICATION_ROOT;
assert.ok(tavernApplicationRoot, "测试必须提供 Isle 内部酒馆应用根目录。");

const workspacePath = await mkdtemp(join(tmpdir(), "isle-dsh-runtime-workspace-"));
const applicationSettingsRoot = join(workspacePath, "application-settings");
const command: RuntimeAgentCommand = {
  runtimeMode: "agent",
  taskId: "dsh-runtime-test",
  workspacePath,
  userMessage: "设计一个场景",
  agentTaskPrompt: "设计一个场景",
  resources: {
    tools: { allowed: ["isle_story_scene_card", "rss_fetch", "tavern_context"] },
    skills: { enabled: [] },
    applications: {
      settingsPath: applicationSettingsRoot,
      items: [
        {
          kind: "dsh",
          id: "@isle/story-scene-card",
          entry: applicationUrl,
          packageRoot: applicationRoot,
          patchPath: join(applicationRoot, "cordis.patch.yml"),
        },
        {
          kind: "isle",
          id: "@isle/rss-reader",
          entry: rssApplicationUrl,
          packageRoot: rssApplicationRoot,
        },
        {
          kind: "dsh",
          id: "@isle/tavern",
          entry: tavernApplicationUrl,
          packageRoot: tavernApplicationRoot,
          patchPath: join(tavernApplicationRoot, "cordis.patch.yml"),
        },
      ],
    },
  },
};

assert.deepEqual(allowedRuntimeTools(command), ["isle_story_scene_card", "rss_fetch", "tavern_context"]);
assert.equal(runtimeResourcesFor(command).applications?.items?.[0]?.id, "@isle/story-scene-card");
assert.equal(runtimeResourcesFor(command).applications?.settingsPath, applicationSettingsRoot);

const resources = await createPiResourceLoader(command, {
  requestUserInput: async () => "",
});
let materializedSkillPath = "";

try {
  assert.equal(resources.toolNames.includes("isle_story_scene_card"), true);
  assert.equal(resources.toolNames.includes("rss_fetch"), true);
  assert.equal(resources.toolNames.includes("tavern_context"), true);
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
  assert.match(skill.sourceInfo.source, /^application:/);
  assert.match(readFileSync(skill.filePath, "utf8"), /isle_story_scene_card/);
  const rssReader = skills.find((candidate) => candidate.name === "isle-rss-reader");
  assert.ok(rssReader, "RSS 应用技能必须进入 Pi Skill 目录。");
  assert.match(readFileSync(rssReader.filePath, "utf8"), /不可信内容/);
  const tavern = skills.find((candidate) => candidate.name === "isle-tavern");
  assert.ok(tavern, "酒馆应用技能必须进入 Pi Skill 目录。");
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
