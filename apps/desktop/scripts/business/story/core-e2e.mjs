import { build } from "esbuild";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const workspaceRoot = process.cwd();
const tempDir = mkdtempSync(join(tmpdir(), "novel-claw-story-core-"));
const entryPath = join(tempDir, "runner.ts");
const bundledPath = join(tempDir, "runner.mjs");
const statePath = resolve(workspaceRoot, "src/features/story/model/story-state.ts");
const manuscriptInboxPath = resolve(workspaceRoot, "src/features/story/model/manuscript-inbox.ts");
const runtimeContextPath = resolve(workspaceRoot, "src/features/story/projection/story-runtime-context.ts");
const normalizePath = resolve(workspaceRoot, "src/features/story/model/story-normalizer.ts");

writeFileSync(entryPath, `
  import {
    createEmptyStoryState,
    createStandaloneStoryJson,
    submitStoryManuscriptToState,
    upsertStoryJson,
  } from ${JSON.stringify(statePath)};
  import {
    acceptStoryManuscriptDraft,
    listStoryManuscriptDrafts,
    updateStoryManuscriptDraft,
  } from ${JSON.stringify(manuscriptInboxPath)};
  import {
    createStoryBranchRuntimeContext,
    createStoryNodeRuntimeContext,
  } from ${JSON.stringify(runtimeContextPath)};
  import {
    normalizeStoryState,
  } from ${JSON.stringify(normalizePath)};

  const assert = (condition: unknown, message: string, details?: unknown) => {
    if (!condition) {
      const suffix = details === undefined ? "" : "\\n" + JSON.stringify(details, null, 2);
      throw new Error(message + suffix);
    }
  };

  const workspaceId = "workspace-story-core";
  const baseStory = createStandaloneStoryJson({
    id: "story-fog-archive",
    workspaceId,
    title: "雾港档案",
    timestamp: 1_800_000_000_000,
  });
  const entryNode = baseStory.graph.nodes[0];
  assert(entryNode, "独立故事应创建起始节点。", baseStory);

  const ledgerScene = {
    id: "scene-ledger",
    title: "巡检室",
    scene: "巡检表上缺了一页。",
    goal: "核对巡检表。",
    plot: "发现缺页。",
    direction: "把注意力落在证据上。",
    transition: "回到潮汐钟。",
    memory: "缺页边缘有盐渍。",
  };
  const ledgerNode = {
    id: "node-ledger",
    stageId: "stage-ledger",
    sceneId: ledgerScene.id,
    title: "巡检表缺页",
    type: "normal",
    pathRole: "main",
    status: "draft",
  };
  const ledgerEdge = {
    id: "edge-entry-ledger",
    fromNodeId: entryNode.id,
    toNodeId: ledgerNode.id,
    label: "进入巡检室",
    reason: "完成入口检查",
    priority: 0,
  };
  const story = {
    ...baseStory,
    outline: "潮汐钟停在三点十七分。",
    goal: "找出停摆原因。",
    userPersonaName: "调查人",
    characters: [
      {
        id: "archivist",
        name: "穆青檐",
        avatar: "blank-avatar",
        description: "档案馆管理员。",
        speakingStyle: "克制，先问证据。",
        memory: {
          required: "",
          public: "知道三点十七分前后巡检表被改过。",
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
        content: "潮汐钟只会在潮差异常时停摆。",
        keywords: ["潮汐钟"],
        enabled: true,
        alwaysOn: true,
      },
    ],
    scenes: [
      {
        ...baseStory.scenes[0],
        id: "scene-entry",
        title: "档案馆入口",
        scene: "雨夜，档案馆的潮汐钟停止。",
        goal: "进入档案馆。",
        plot: "调查人抵达入口。",
        direction: "克制悬疑。",
        transition: "进入巡检室。",
        memory: "入口潮气很重。",
      },
      ledgerScene,
    ],
    graph: {
      entryNodeId: entryNode.id,
      activeNodeId: ledgerNode.id,
      stages: [
        { ...baseStory.graph.stages[0], id: "stage-entry", title: "入口阶段" },
        { id: "stage-ledger", title: "证据阶段", order: 1 },
      ],
      nodes: [
        { ...entryNode, stageId: "stage-entry", sceneId: "scene-entry", title: "入口节点" },
        ledgerNode,
      ],
      edges: [ledgerEdge],
    },
  };

  const state = upsertStoryJson(createEmptyStoryState(), story);
  assert(
    state.activeStoryId === story.id &&
      state.stories.length === 1,
    "upsert 应维护当前故事状态。",
    state,
  );

  const submitted = submitStoryManuscriptToState(state, {
    storyId: story.id,
    nodeId: ledgerNode.id,
    source: "chat",
    sourceRunId: "chat-run-1",
    sourceMessageIds: ["message-1"],
    title: "巡检表稿件",
    content: "调查人发现巡检表缺页，盐渍说明它曾被带到潮边。",
    summary: "发现巡检表缺页。",
    metadata: { channel: "chat" },
  }, {
    timestamp: 1_800_000_000_200,
  });
  const updatedInbox = updateStoryManuscriptDraft(
    submitted.story.manuscriptInbox,
    submitted.draft.id,
    {
      title: "巡检表缺页稿",
      summary: "确认巡检表缺页。",
      updatedAt: 1_800_000_000_250,
    },
  );
  const pendingDrafts = listStoryManuscriptDrafts(updatedInbox, {
    storyId: story.id,
    nodeId: ledgerNode.id,
    status: "pending",
  });
  assert(
    pendingDrafts.length === 1 &&
      pendingDrafts[0]?.title === "巡检表缺页稿",
    "稿件收件箱应支持查询和编辑待确认稿。",
    pendingDrafts,
  );

  const acceptedResult = acceptStoryManuscriptDraft(
    updatedInbox,
    submitted.draft.id,
    { acceptedAt: 1_800_000_000_300 },
  );
  const acceptedStory = {
    ...submitted.story,
    manuscriptInbox: acceptedResult.inbox,
    updatedAt: 1_800_000_000_300,
  };
  const nodeContext = createStoryNodeRuntimeContext(acceptedStory, {
    nodeId: ledgerNode.id,
  });
  assert(
    nodeContext.scope === "node" &&
      nodeContext.current.node?.id === ledgerNode.id &&
      nodeContext.current.scene?.id === ledgerScene.id &&
      nodeContext.current.progress.includes("发现缺页") &&
      nodeContext.current.progress.includes("确认巡检表缺页") &&
      nodeContext.graph.activeNodeId === ledgerNode.id &&
      nodeContext.scenes.some((scene) => scene.id === ledgerScene.id) &&
      nodeContext.memory.acceptedManuscripts.length === 1 &&
      nodeContext.memory.characterPublicMemories[0]?.memory.includes("巡检表被改过"),
    "节点运行上下文应包含背景、结构、场景、当前节点进展、角色记忆和已收稿件。",
    nodeContext,
  );

  const branchContext = createStoryBranchRuntimeContext(acceptedStory, {
    activeNodeId: ledgerNode.id,
    pathNodeIds: [entryNode.id, ledgerNode.id],
    pathEdgeIds: [ledgerEdge.id],
  });
  assert(
    branchContext.scope === "branch" &&
      branchContext.branch.pathNodeIds.join(">") === [entryNode.id, ledgerNode.id].join(">") &&
      branchContext.branch.pathEdgeIds[0] === ledgerEdge.id &&
      branchContext.branch.incomingEdges[0]?.id === ledgerEdge.id,
    "分支运行上下文应保留路径节点、路径边和当前节点入边。",
    branchContext,
  );

  const normalizedState = normalizeStoryState(workspaceId, {
    version: 1,
    activeStoryId: acceptedStory.id,
    stories: [
      acceptedStory,
      { ...acceptedStory, id: "other-story", workspaceId: "other-workspace" },
    ],
  });
  assert(
    normalizedState?.activeStoryId === acceptedStory.id &&
      normalizedState.stories.length === 2 &&
      normalizedState.stories.every((item) => item.workspaceId === workspaceId),
    "故事状态归一化应绑定目标工作区并保留当前故事。",
    normalizedState,
  );
`);

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
  console.log("[story-core] ok");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
