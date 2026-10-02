import {
  storySkillDefinitions,
  storySkillRequirements,
  storySkillResources,
} from "../../generated/skills.js";
import { defineProtocol } from "../../../../core/protocol.js";

// Skill-side compatibility requirement: update only after reviewing the skill workflows.
// Do not alias the provider contract here: that would hide incompatible provider upgrades.
export const storySkillContract = defineProtocol<{
  describeStructure(): unknown;
  initialize(): unknown;
  readContext(): unknown;
  validateChanges(): unknown;
  commitChanges(): unknown;
}>()({
  id: "mewvis.story-project-tool",
  version: 2,
  properties: {},
  methods: {
    describeStructure: {},
    initialize: {},
    readContext: {},
    validateChanges: {},
    commitChanges: {},
  },
});

export const STORY_AUTHORING_SKILL = Object.freeze({
  id: "story-authoring",
  referenceName: "story-assistant",
  requiredToolContracts: [storySkillContract],
  definitions: storySkillDefinitions,
  requirements: storySkillRequirements,
  resources: storySkillResources,
});
