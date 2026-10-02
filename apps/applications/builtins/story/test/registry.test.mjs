import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

const result = await build({
  stdin: {
    contents: `
      export { createStoryRegistry } from './main/host/registry.ts';
      export { validateStoryRegistry } from './main/host/adapters/validation.ts';
      export { storySkillContract } from './main/host/authoring/skills/definition.ts';
      export { STORY_TOOL } from './main/host/authoring/tool/definition.ts';
      export * from './main/host/generated/skills.ts';
    `,
    resolveDir: fileURLToPath(new URL("..", import.meta.url)),
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const {
  createStoryRegistry,
  validateStoryRegistry,
  storySkillContract,
  STORY_TOOL,
  storySkillDefinitions,
  storySkillResources,
  storySkillRequirements,
} = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
);

function fixture() {
  return {
    // Registry construction must not call any host service or register anything.
    tools: createStoryRegistry({}).tools.map((tool) => ({
      ...tool,
      parameters: structuredClone(tool.parameters),
    })),
    skills: structuredClone(storySkillDefinitions),
    resources: { ...storySkillResources },
    requirements: structuredClone(storySkillRequirements),
    requiredContract: storySkillContract,
    providedContract: structuredClone(STORY_TOOL.contract),
    implementation: {
      ...STORY_TOOL.createImplementation({ workspacePath: "." }).api,
    },
  };
}

test("the app creates one validated registry without using host services", () => {
  const input = fixture();
  validateStoryRegistry(input);
  assert.equal(input.tools.length, 22);
  assert.equal(input.skills.length, 8);
  assert.ok(input.requirements.every((skill) => skill.tools.includes("story")));
  const router = input.requirements.find(
    (skill) => skill.name === "story-assistant",
  );
  assert.equal(router.skills.length, 7);
  assert.ok(router.resources.includes("references/story-tool-binding.md"));
});

test("app-owned checks reject incompatible registry entries", async (t) => {
  const cases = [
    [
      "missing business tool",
      (input) => {
        input.tools = input.tools.filter((tool) => tool.name !== "story");
      },
      /缺少故事工具/,
    ],
    [
      "missing skill loader",
      (input) => {
        input.tools = input.tools.filter(
          (tool) => tool.name !== "mewvis_story_skill",
        );
      },
      /技能工具参数不兼容|缺少工具/,
    ],
    [
      "duplicate tool",
      (input) => {
        input.tools.push(input.tools[0]);
      },
      /工具名称无效或重复/,
    ],
    [
      "missing implementation",
      (input) => {
        input.tools[0].execute = undefined;
      },
      /工具缺少实现/,
    ],
    [
      "duplicate skill",
      (input) => {
        input.skills.push(input.skills[0]);
      },
      /技能名称无效或重复/,
    ],
    [
      "missing route",
      (input) => {
        input.skills = input.skills.filter(
          (skill) => skill.name !== "story-assistant-review",
        );
      },
      /不存在的技能|没有对应定义/,
    ],
    [
      "missing resource",
      (input) => {
        delete input.resources[
          "story-assistant/references/story-tool-binding.md"
        ];
      },
      /缺少技能资源/,
    ],
    [
      "escaping resource",
      (input) => {
        input.requirements[0].resources.push("../../outside.md");
      },
      /路径越界/,
    ],
    [
      "unsupported action",
      (input) => {
        input.requirements[0].actions.push("remove_everything");
      },
      /不支持的 story action/,
    ],
    [
      "new incompatible contract",
      (input) => {
        input.providedContract.version += 1;
      },
      /协议不兼容/,
    ],
    [
      "missing contract member",
      (input) => {
        delete input.providedContract.methods.commitChanges;
      },
      /协议不兼容/,
    ],
    [
      "unimplemented contract",
      (input) => {
        delete input.implementation.commitChanges;
      },
      /实现不完整/,
    ],
    [
      "missing workspace requirement",
      (input) => {
        input.tools.find((tool) => tool.name === "story").parameters.required =
          ["action"];
      },
      /缺少必填参数 workspaceId/,
    ],
    [
      "incompatible resource parameters",
      (input) => {
        delete input.tools.find(
          (tool) => tool.name === "mewvis_story_skill_resource",
        ).parameters.properties.path;
      },
      /技能工具参数不兼容/,
    ],
  ];
  for (const [name, change, expected] of cases) {
    await t.test(name, () => {
      const input = fixture();
      change(input);
      assert.throws(() => validateStoryRegistry(input), expected);
    });
  }
});

test("an incompatible application registers no partial tools or skills", async () => {
  const broken = await build({
    entryPoints: [
      fileURLToPath(new URL("../main/host/index.ts", import.meta.url)),
    ],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    plugins: [
      {
        name: "incompatible-skill-contract",
        setup(builder) {
          builder.onLoad(
            { filter: /authoring\/skills\/definition\.ts$/ },
            async ({ path }) => ({
              contents: (await readFile(path, "utf8")).replace(
                "version: 2",
                "version: 3",
              ),
              loader: "ts",
            }),
          );
        },
      },
    ],
  });
  const { default: application } = await import(
    `data:text/javascript;base64,${Buffer.from(broken.outputFiles[0].text).toString("base64")}`
  );
  const registered = [];
  assert.throws(
    () =>
      application.apply({
        workspaces: {},
        tools: { register: (tool) => registered.push(tool) },
        skills: { register: (skill) => registered.push(skill) },
      }),
    /协议不兼容/,
  );
  assert.deepEqual(registered, []);
});
