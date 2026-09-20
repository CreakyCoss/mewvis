import { storyAssistantProfile } from "../../../assistant/profile";
import { storyDocumentData } from "../../../story-document";
import type { StoryLibraryItem } from "../../../storage";
export const prepareStoryChatProfile = (story: StoryLibraryItem) => storyAssistantProfile({
  storyId: story.overview.id, title: story.overview.title, workspaceId: story.workspace.id,
  revision: story.documents.map(storyDocumentData).find(data => data?.kind === "story-manifest")?.revision as number | undefined,
});
