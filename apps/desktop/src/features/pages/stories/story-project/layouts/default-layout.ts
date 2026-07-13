import type { StoryProjectLayout } from "../../../../../../protocols/story-project";

export const DEFAULT_STORY_PROJECT_LAYOUT: StoryProjectLayout = {
  profile: {
    id: "novel-claw.story.default-novel",
    version: 1,
  },
  layoutVersion: 1,
  rootPath: "story",
  documents: {
    "story-manifest": { pathPattern: "story/manifest.json" },
    "story-book": { pathPattern: "story/book.json" },
    "story-positioning": { pathPattern: "story/positioning.json" },
    "story-style": { pathPattern: "story/style.json" },
    "story-character": { pathPattern: "story/characters/{id}.json" },
    "story-relationships": { pathPattern: "story/relationships.json" },
    "story-world-entry": { pathPattern: "story/world/{id}.json" },
    "story-book-arc": { pathPattern: "story/outline/book-arc.json" },
    "story-volume": { pathPattern: "story/outline/volumes/{id}.json" },
    "story-chapter-plan": { pathPattern: "story/outline/chapters/{id}.json" },
    "story-chapter": { pathPattern: "story/tracking/chapter-results/{id}.json" },
    "story-chapter-content": { pathPattern: "story/chapters/{id}.md" },
    "story-character-state": { pathPattern: "story/tracking/character-states/{characterId}.json" },
    "story-foreshadows": { pathPattern: "story/tracking/foreshadows.json" },
    "story-timeline": { pathPattern: "story/tracking/timeline/{id}.json" },
    "story-progress": { pathPattern: "story/tracking/progress.json" },
    "story-scene": { pathPattern: "story/interactive/scenes/{id}.json" },
    "story-graph": { pathPattern: "story/interactive/graph.json" },
    "story-analysis": { pathPattern: "story/analysis/{id}.json" },
    "story-review": { pathPattern: "story/reviews/{id}.json" },
    "story-import": { pathPattern: "story/imports/{id}.json" },
  },
};
