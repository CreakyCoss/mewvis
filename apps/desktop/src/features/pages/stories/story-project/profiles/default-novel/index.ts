import { STORY_PROJECT_IDENTIFIERS } from "../../../../../../../protocols/story-project/identifiers";
import { defineStoryProfile } from "../../../../../../../protocols/story-project/declarative/profile";
import metadata from "./profile/metadata.json";
import assistantObjects from "./profile/objects/assistant.json";
import coreObjects from "./profile/objects/core.json";
import interactiveObjects from "./profile/objects/interactive.json";
import outlineObjects from "./profile/objects/outline.json";
import peopleObjects from "./profile/objects/people.json";
import trackingObjects from "./profile/objects/tracking.json";
import assistantDocuments from "./profile/documents/assistant.json";
import coreDocuments from "./profile/documents/core.json";
import interactiveDocuments from "./profile/documents/interactive.json";
import outlineDocuments from "./profile/documents/outline.json";
import peopleDocuments from "./profile/documents/people.json";
import trackingDocuments from "./profile/documents/tracking.json";

const source = {
  $format: STORY_PROJECT_IDENTIFIERS.declarativeProfile.format,
  schemaVersion: STORY_PROJECT_IDENTIFIERS.declarativeProfile.schemaVersion,
  ...metadata,
  objectDefinitions: {
    ...coreObjects,
    ...peopleObjects,
    ...outlineObjects,
    ...trackingObjects,
    ...interactiveObjects,
    ...assistantObjects,
  },
  documents: {
    ...coreDocuments,
    ...peopleDocuments,
    ...outlineDocuments,
    ...trackingDocuments,
    ...interactiveDocuments,
    ...assistantDocuments,
  },
};

export const DEFAULT_STORY_PROFILE = defineStoryProfile(source, {
  optionalDocumentKinds: ["story-analysis", "story-review", "story-import"],
});

export const DEFAULT_STORY_PROFILE_SOURCE = DEFAULT_STORY_PROFILE.source;
