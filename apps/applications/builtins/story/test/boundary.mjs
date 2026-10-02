import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const app = fileURLToPath(new URL("..", import.meta.url));
const repo = fileURLToPath(new URL("../../../../..", import.meta.url));
const walk = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? walk(join(directory, entry.name))
      : [join(directory, entry.name)],
  );
for (const path of walk(join(app, "main")).filter((path) =>
  /\.tsx?$/.test(path),
)) {
  assert.doesNotMatch(
    readFileSync(path, "utf8"),
    /from\s+["'][^"']*(?:client\/src|agent-runtime\/src|@\/api\/|@\/chat\/desktop|@\/workbench\/)/,
    path,
  );
}
for (const path of [
  "apps/client/src/workbench/pages/stories",
  "apps/client/core/story-project",
  "apps/agent-runtime/src/engines/builtins/story",
  "apps/server/src/modules/stories",
  "apps/server/src/modules/tavern",
  "apps/server/src/bootstrap/migrations/story-application.ts",
  "apps/client/src/assets/avatars/portraits",
  "apps/client/src/assets/backgrounds",
  "apps/client/src/assets/react.svg",
  "apps/client/scripts/business/scene-novelizer/review-rewrite-e2e.mjs",
]) {
  assert.equal(
    existsSync(join(repo, path)),
    false,
    `业务实现仍在宿主：${path}`,
  );
}
const hostAssets = join(repo, "apps/client/src/assets");
assert.equal(existsSync(join(app, "main/assets/avatars/cats")), false);
assert.equal(walk(join(hostAssets, "avatars/cats")).length, 8);
assert.equal(walk(join(app, "main/assets/avatars/portraits")).length, 40);
assert.equal(walk(join(app, "main/assets/backgrounds")).length, 8);
assert.doesNotMatch(
  readFileSync(join(hostAssets, "avatars/index.ts"), "utf8"),
  /portraits|tavernAvatar/,
);
assert.doesNotMatch(
  readFileSync(join(app, "main/assets/avatars/index.ts"), "utf8"),
  /\.\/cats\/|agentAvatar/,
);
assert.doesNotMatch(
  readFileSync(join(repo, "apps/client/src/App.css"), "utf8"),
  /tavern-immersive/,
);
assert.doesNotMatch(
  readFileSync(join(repo, "apps/client/src/workbench/routes.tsx"), "utf8"),
  /stories|%2Fstory/,
);
console.log("[story-application-boundary] ok");
