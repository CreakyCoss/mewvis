import { defineSkill } from "@isle/app-sdk";
import { storySkillDefinitions } from "./story-skills.generated.js";

export default [
  ...storySkillDefinitions.map(defineSkill),
];
