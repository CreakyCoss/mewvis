import type { StoryFileLayout } from "../../storage/types.js";

export const LONG_NOVEL_FILE_LAYOUT: StoryFileLayout = Object.freeze({
  definitionPath: "story/.novel-claw/project.json",
  managedRoots: Object.freeze(["story"]),
  preservedPaths: Object.freeze(["story/.novel-claw", "story/runtime", "story/tavern.json"]),
  documentPaths: Object.freeze({
    "story-manifest": "story/manifest.json",
    "story-book": "story/book.json",
    "story-positioning": "story/positioning.json",
    "story-style": "story/style.json",
    "story-character": "story/characters/{id}.json",
    "story-relationships": "story/relationships.json",
    "story-world-entry": "story/world/{id}.json",
    "story-book-arc": "story/outline/book-arc.json",
    "story-volume": "story/outline/volumes/{id}.json",
    "story-chapter-plan": "story/outline/chapters/{id}.json",
    "story-chapter": "story/tracking/chapter-results/{id}.json",
    "story-chapter-content": "story/chapters/{id}.md",
    "story-character-state": "story/tracking/character-states/{characterId}.json",
    "story-foreshadows": "story/tracking/foreshadows.json",
    "story-timeline": "story/tracking/timeline/{id}.json",
    "story-progress": "story/tracking/progress.json",
    "story-analysis": "story/analysis/{id}.json",
    "story-review": "story/reviews/{id}.json",
    "story-import": "story/imports/{id}.json",
  }),
});
