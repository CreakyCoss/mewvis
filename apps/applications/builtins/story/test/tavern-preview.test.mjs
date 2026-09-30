import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const bundle = await build({
  stdin: {
    contents: [
      'export { getTavernPreviewContent } from "./main/stories/tavern/manage/preview-content.ts";',
      'export { TAVERN_ROOM_STYLES } from "./main/stories/tavern/presets/prompts/room-styles.ts";',
      'export { TAVERN_SYSTEM_NARRATIVE_STYLES } from "./main/stories/tavern/presets/prompts/system-narrative-styles.ts";',
      'export { TAVERN_PRESENTATION_RULES } from "./main/stories/tavern/presets/prompts/presentation-rules.ts";',
    ].join("\n"),
    resolveDir: root,
    loader: "ts",
  },
  tsconfig: `${root}/tsconfig.json`,
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const {
  getTavernPreviewContent,
  TAVERN_ROOM_STYLES,
  TAVERN_SYSTEM_NARRATIVE_STYLES,
  TAVERN_PRESENTATION_RULES,
} = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);
const preview = (roomStyleId, narrativeStyleId, presentationProfileId) =>
  getTavernPreviewContent({
    roomStyleId,
    narrativeStyleId,
    presentationProfileId,
  });
const visibleText = (content, presentation) =>
  presentation.renderStyle === "chat"
    ? content.narrator + content.action + content.dialogue
    : content.paragraphs.join("\n");

test("every narrative and room preset changes the visible example in all presentation modes", () => {
  for (const presentation of TAVERN_PRESENTATION_RULES) {
    for (const room of TAVERN_ROOM_STYLES) {
      const examples = TAVERN_SYSTEM_NARRATIVE_STYLES.map((narrative) =>
        visibleText(preview(room.id, narrative.id, presentation.id), presentation),
      );
      assert.equal(new Set(examples).size, TAVERN_SYSTEM_NARRATIVE_STYLES.length);
    }
    for (const narrative of TAVERN_SYSTEM_NARRATIVE_STYLES) {
      const examples = TAVERN_ROOM_STYLES.map((room) =>
        visibleText(preview(room.id, narrative.id, presentation.id), presentation),
      );
      assert.equal(new Set(examples).size, TAVERN_ROOM_STYLES.length);
    }
  }
});

test("indirect narration excludes quoted dialogue while novel prose preserves it", () => {
  for (const room of TAVERN_ROOM_STYLES) {
    for (const narrative of TAVERN_SYSTEM_NARRATIVE_STYLES) {
      const indirect = preview(room.id, narrative.id, "third-person-prose");
      const novel = preview(room.id, narrative.id, "novel-prose");
      assert.doesNotMatch(indirect.paragraphs.join("\n"), /[“”]/);
      assert.ok(novel.paragraphs.some((paragraph) => paragraph.includes(`“${novel.dialogue}”`)));
      assert.notDeepEqual(indirect.paragraphs, novel.paragraphs);
    }
  }
});

test("restrained examples stay brief and dramatic examples add a public pressure beat", () => {
  for (const room of TAVERN_ROOM_STYLES) {
    for (const presentation of TAVERN_PRESENTATION_RULES.filter((item) => item.renderStyle === "prose")) {
      const restrained = preview(room.id, "restrained", presentation.id);
      const balanced = preview(room.id, "balanced", presentation.id);
      const dramatic = preview(room.id, "dramatic", presentation.id);
      assert.equal(restrained.paragraphs.length, 1);
      assert.equal(balanced.paragraphs.length, 2);
      assert.equal(dramatic.paragraphs.length, 3);
      assert.ok(restrained.paragraphs.join("").length < balanced.paragraphs.join("").length);
      assert.ok(dramatic.paragraphs.join("").length > balanced.paragraphs.join("").length);
      assert.ok(dramatic.paragraphs.join("").length <= 160);
    }
  }
});
