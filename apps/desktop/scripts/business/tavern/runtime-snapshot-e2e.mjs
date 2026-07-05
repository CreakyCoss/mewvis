import { build } from "esbuild";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const workspaceRoot = process.cwd();
const tempDir = mkdtempSync(join(tmpdir(), "novel-claw-tavern-runtime-snapshot-"));
const entryPath = join(tempDir, "runner.ts");
const bundledPath = join(tempDir, "runner.mjs");
const manualFactoriesPath = resolve(workspaceRoot, "src/features/pages/tavern/factories/manual-factories.ts");
const presentationInputPath = resolve(workspaceRoot, "src/features/pages/tavern/presentation/input/index.ts");
const snapshotPath = resolve(workspaceRoot, "src/features/pages/tavern/adapters/runtime-room-snapshot.ts");
const storyTavernInputPath = resolve(workspaceRoot, "src/features/story/projection/tavern-input.ts");
const storyRuntimeContextPath = resolve(workspaceRoot, "src/features/story/projection/story-runtime-context.ts");

writeFileSync(
  entryPath,
  `
  import {
    createTavernRoom,
  } from ${JSON.stringify(manualFactoriesPath)};
  import {
    materializeTavernPresentationInput,
  } from ${JSON.stringify(presentationInputPath)};
  import {
    createTavernInputFromStoryRuntimeContext,
  } from ${JSON.stringify(storyTavernInputPath)};
  import {
    createStoryNodeRuntimeContext,
  } from ${JSON.stringify(storyRuntimeContextPath)};
  import {
    createTavernRuntimeRoomSnapshot,
    materializeTavernRuntimeRoomSnapshot,
    parseTavernRuntimeRoomSnapshot,
  } from ${JSON.stringify(snapshotPath)};

  const assert = (condition: unknown, message: string, details?: unknown) => {
    if (!condition) {
      const suffix = details === undefined ? "" : "\\n" + JSON.stringify(details, null, 2);
      throw new Error(message + suffix);
    }
  };

  const room = createTavernRoom("workspace-source", 7);
  const activeInstance = room.sceneInstances[0];
  assert(activeInstance, "默认酒馆房间应创建运行场景实例。", room);

  const activeMessage = {
    id: "message-active",
    roomId: room.id,
    sceneId: activeInstance.sceneId,
    sceneInstanceId: activeInstance.id,
    kind: "user_input" as const,
    role: "user" as const,
    content: "检查运行快照。",
    createdAt: 1_800_000_100_000,
    status: "done" as const,
  };
  const orphanMessage = {
    id: "message-orphan",
    roomId: "other-room",
    sceneInstanceId: "orphan-instance",
    role: "narrator" as const,
    content: "不应出现在快照中。",
    createdAt: 1_800_000_100_001,
  };

  const snapshot = createTavernRuntimeRoomSnapshot({
    room: {
      ...room,
      locked: true,
      updatedAt: 1_800_000_100_010,
    },
    messagesByInstance: {
      [activeInstance.id]: [activeMessage],
      "orphan-instance": [orphanMessage],
    },
    exportedAt: "2026-06-25T00:00:00.000Z",
  });
  assert(
    snapshot.schema === "novel-claw.tavern-runtime-room" &&
      snapshot.version === 1 &&
      snapshot.exportedAt === "2026-06-25T00:00:00.000Z" &&
      snapshot.room.id === room.id &&
      snapshot.room.activeSceneInstanceId === activeInstance.id,
    "运行快照应使用新 schema 并投影当前运行场景。",
    snapshot,
  );
  assert(
    Object.keys(snapshot.messagesByInstance).length === room.sceneInstances.length &&
      snapshot.messagesByInstance[activeInstance.id]?.[0]?.id === activeMessage.id &&
      !("orphan-instance" in snapshot.messagesByInstance),
    "运行快照只应导出当前房间场景实例的消息。",
    snapshot.messagesByInstance,
  );

  const parsed = parseTavernRuntimeRoomSnapshot(JSON.parse(JSON.stringify(snapshot)));
  assert(
    parsed?.schema === snapshot.schema &&
      parsed.room.id === room.id,
    "运行快照解析器应接受当前版本快照。",
    parsed,
  );
  assert(
    parseTavernRuntimeRoomSnapshot({
      schema: "novel-claw.tavern-room",
      version: 4,
      room,
      messagesByInstance: {},
    }) === null,
    "运行快照解析器应拒绝旧 tavern room 导出 schema。",
  );
  assert(
    parseTavernRuntimeRoomSnapshot({
      schema: "novel-claw.tavern-runtime-room",
      version: 1,
      room,
    }) === null,
    "运行快照解析器应拒绝缺少消息表的快照。",
  );

  const materialized = materializeTavernRuntimeRoomSnapshot({
    snapshot,
    workspaceId: "workspace-target",
    timestamp: 1_800_000_200_000,
  });
  const materializedMessage = materialized.messagesByInstance[activeInstance.id]?.[0];
  assert(
    materialized.room.workspaceId === "workspace-target" &&
      materialized.room.locked === false &&
      materialized.room.creationSource === "imported" &&
      materialized.room.updatedAt === 1_800_000_200_000 &&
      materialized.room.activeSceneInstanceId === activeInstance.id,
    "物化运行快照应绑定到目标 workspace 并解锁为导入房间。",
    materialized.room,
  );
  assert(
    materializedMessage?.roomId === room.id &&
      materializedMessage.sceneId === activeInstance.sceneId &&
      materializedMessage.sceneInstanceId === activeInstance.id &&
      materialized.messagesByInstance["orphan-instance"] === undefined,
    "物化运行快照应重建场景实例消息归属。",
    materialized.messagesByInstance,
  );

  const storyAsset = {
    id: "story-seed",
    workspaceId: "workspace-source",
    title: "种子故事",
    outline: "故事资产负责维护内容，酒馆桥接负责转成酒馆输入。",
    goal: "验证 tavern adapter 使用酒馆私有输入格式。",
    userPersonaName: "调查人",
    graph: {
      entryNodeId: "node-entry",
      activeNodeId: "node-target",
      stages: [
        { id: "stage-entry", title: "入口", order: 0 },
      ],
      nodes: [
        {
          id: "node-entry",
          stageId: "stage-entry",
          sceneId: "scene-entry",
          title: "入口节点",
          type: "normal",
          pathRole: "main",
          status: "ready",
        },
        {
          id: "node-target",
          stageId: "stage-entry",
          sceneId: "scene-target",
          title: "目标节点",
          type: "normal",
          pathRole: "main",
          status: "draft",
        },
      ],
      edges: [
        {
          id: "edge-entry-target",
          fromNodeId: "node-entry",
          toNodeId: "node-target",
          label: "进入目标",
          priority: 0,
        },
      ],
    },
    scenes: [
      {
        id: "scene-entry",
        title: "入口场景",
        scene: "入口灯光很暗。",
        goal: "进入房间。",
        plot: "抵达入口。",
        direction: "克制叙事。",
        transition: "进入目标场景。",
        memory: "入口有潮气。",
      },
      {
        id: "scene-target",
        title: "目标场景",
        scene: "目标房间里有一张巡检表。",
        goal: "检查巡检表。",
        plot: "发现缺页。",
        direction: "证据优先。",
        transition: "",
        memory: "缺页边缘有盐渍。",
      },
    ],
    characters: [
      {
        id: "archivist",
        name: "穆青檐",
        description: "档案馆管理员。",
        speakingStyle: "克制。",
        relationshipSummary: "",
        publicRelationshipSummary: "",
        memory: {
          required: "",
          public: "知道潮汐钟异常。",
          known: "",
          privateSelf: "",
          directorSecret: "",
        },
      },
    ],
    lorebookEntries: [
      {
        id: "lore-clock",
        title: "潮汐钟",
        content: "潮汐钟只在潮差异常时停摆。",
        keywords: ["潮汐钟"],
        enabled: true,
        alwaysOn: true,
      },
    ],
    sourceRefs: [],
    createdAt: 1_800_000_300_000,
    updatedAt: 1_800_000_300_100,
  };
  const tavernInput = createTavernInputFromStoryRuntimeContext(
    createStoryNodeRuntimeContext(storyAsset, { nodeId: "node-target" }),
  );
  const seedMaterialized = materializeTavernPresentationInput(
    "workspace-seed",
    tavernInput,
    {
      roomId: "room-from-seed",
      createdAt: 1_800_000_300_200,
    },
  );
  assert(
    tavernInput.route.activeNodeId === "node-target" &&
      tavernInput.scenes.items.length === 2 &&
      tavernInput.cast.characters[0]?.memory?.includes("潮汐钟异常") &&
      seedMaterialized.room.storyBinding?.storyId === "story-seed" &&
      seedMaterialized.room.storyGraph.activeNodeId === "node-target" &&
      seedMaterialized.room.sceneInstances.some((instance) => instance.nodeId === "node-target"),
    "story tavern bridge 应能从故事标准数据包创建酒馆私有输入并物化运行房间。",
    seedMaterialized.room,
  );
`,
);

try {
  await build({
    entryPoints: [entryPath],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: bundledPath,
    target: "node22",
    alias: {
      "@": resolve(workspaceRoot, "src"),
      "@engines/native/agent": resolve(workspaceRoot, "agent-runtime/src/engines/drivers/native/agent"),
    },
    loader: {
      ".jpg": "dataurl",
      ".jpeg": "dataurl",
      ".png": "dataurl",
      ".svg": "dataurl",
      ".webp": "dataurl",
    },
  });
  await import(pathToFileURL(bundledPath).href);
  console.log("[tavern-runtime-snapshot] ok");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
