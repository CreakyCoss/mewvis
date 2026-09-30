import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const bundle = await build({
  stdin: {
    contents: 'export * from "./main/stories/tavern/presets/visual-presets/index.ts";',
    resolveDir: root,
    loader: "ts",
  },
  tsconfig: `${root}/tsconfig.json`,
  loader: { ".jpg": "dataurl", ".css": "empty" },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { TAVERN_SCENE_PRESET_OPTIONS, getVisualPreset, normalizeVisualPresetId } =
  await import(
    `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
  );

test("every scene has independent background artwork and visual styling", () => {
  const scenes = TAVERN_SCENE_PRESET_OPTIONS;
  assert.equal(new Set(scenes.map((scene) => scene.tavern.backgroundImage)).size, scenes.length);
  for (const field of ["header", "sceneCard", "narratorBubble", "characterBubble", "userBubble", "composerInput"]) {
    assert.equal(new Set(scenes.map((scene) => scene.tavern[field])).size, scenes.length, field);
  }
});

test("existing saved scene ids remain available", () => {
  for (const id of ["general", "wuxia", "tavern", "modern", "mystery", "scifi", "fantasy", "oracle"]) {
    assert.equal(normalizeVisualPresetId(id), id);
    assert.equal(getVisualPreset(id).id, id);
  }
  assert.equal(getVisualPreset("unknown-scene").id, "general");
});

const luminance = (hex) => {
  const channels = hex.match(/[a-f\d]{2}/gi).map((value) => parseInt(value, 16) / 255);
  const [r, g, b] = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (first, second) => {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
};

test("user dialogue stays readable at every gradient color stop", () => {
  for (const scene of TAVERN_SCENE_PRESET_OPTIONS) {
    const classes = scene.tavern.userBubble;
    for (const gradient of classes.matchAll(/(dark:)?bg-\[linear-gradient\(([^\]]+)\)\]/g)) {
      const foreground = gradient[1]
        ? classes.match(/dark:text-\[(#[a-f\d]{6})\]/i)?.[1] ?? "#ffffff"
        : "#ffffff";
      for (const background of gradient[2].match(/#[a-f\d]{6}/gi)) {
        assert.ok(contrast(foreground, background) >= 4.5, `${scene.id}: ${foreground} on ${background}`);
      }
    }
  }
});

test("scene text and primary labels remain readable on their base surfaces", async () => {
  const css = await readFile(`${root}/main/stories/tavern/presets/visual-presets/themes.css`, "utf8");
  for (const block of css.matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
    const colors = Object.fromEntries(
      [...block[2].matchAll(/--([\w-]+):\s*(#[a-f\d]{6})/gi)].map((match) => [match[1], match[2]]),
    );
    if (!colors.background) continue;
    for (const [foreground, background] of [
      ["foreground", "background"],
      ["muted-foreground", "background"],
      ["card-foreground", "card"],
      ["primary-foreground", "primary"],
    ]) {
      assert.ok(contrast(colors[foreground], colors[background]) >= 4.5, `${block[1].trim()}: ${foreground}`);
    }
  }
});
