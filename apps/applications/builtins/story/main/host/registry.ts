import { defineSkill, type MewvisApplicationContext } from "@mewvis/app-sdk";
import { STORY_AUTHORING } from "./authoring/index.js";
import { createStoryTools } from "./tools/index.js";
import { validateStoryRegistry } from "./adapters/validation.js";

// Validate the complete application registry before registering anything with the host.
export function createStoryRegistry(ctx: MewvisApplicationContext) {
  const tools = createStoryTools(ctx);
  const {
    skill,
    tools: [storyTool],
  } = STORY_AUTHORING;
  validateStoryRegistry({
    tools,
    skills: skill.definitions,
    resources: skill.resources,
    requirements: skill.requirements,
    requiredContract: skill.requiredToolContracts[0],
    providedContract: storyTool.contract,
    implementation: storyTool.createImplementation({ workspacePath: "." }).api,
  });
  return {
    tools,
    skills: skill.definitions.map((skill) =>
      defineSkill({ ...skill, source: "bundled" }),
    ),
  };
}
