import { build } from "esbuild";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const workspaceRoot = process.cwd();
const tempDir = mkdtempSync(join(tmpdir(), "novel-claw-scene-novelizer-review-"));
const entryPath = join(tempDir, "runner.ts");
const bundledPath = join(tempDir, "runner.mjs");
const mockAgentClientPath = join(tempDir, "mock-agent-client.ts");
const runtimePath = resolve(workspaceRoot, "src/features/scene-novelizer/runtime/run-scene-novelizer.ts");

writeFileSync(mockAgentClientPath, `
  const mockRunsKey = "__novelClawSceneNovelizerMockRuns";
  const globalMockState = globalThis as typeof globalThis & Record<string, any[] | undefined>;
  const listeners = new Set<any>();
  export const sceneNovelizerMockRuns: any[] = globalMockState[mockRunsKey] ?? [];
  globalMockState[mockRunsKey] = sceneNovelizerMockRuns;

  const emit = (event: any) => {
    for (const listener of listeners) {
      listener(event);
    }
  };

  export const createAgentClient = () => ({
    subscribe: async (listener: any) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    run: async (input: any) => {
      sceneNovelizerMockRuns.push(input);
      const taskId = "scene-novelizer-review-task";
      const workflowRunId = "scene-novelizer-review-workflow";
      setTimeout(() => {
        emit({
          type: "workflow_started",
          taskId,
          workflowRunId,
          workflowId: "producer.review-rewrite-loop:scene-novelizer",
          runtimeId: "langgraph",
        });
        emit({
          type: "workflow_done",
          taskId,
          workflowRunId,
          result: {
            workflowRunId,
            runtimeId: "langgraph",
            mode: "producer.review-rewrite-loop",
            steps: [
              {
                stepId: "producer",
                stepType: "agent",
                agentRoleId: "scene-novelizer-webnovel-writer",
                outputKey: "draft",
                output: "初稿：风铃响起。",
                text: "初稿：风铃响起。",
              },
              {
                stepId: "reviewer",
                stepType: "agent",
                agentRoleId: "scene-novelizer-webnovel-reviewer",
                outputKey: "reviewRaw",
                output: JSON.stringify({
                  status: "revise",
                  score: 65,
                  reason: "缺少动作承接。",
                  revisionInstruction: "补足行动与钩子。",
                }),
                text: JSON.stringify({
                  status: "revise",
                  score: 65,
                  reason: "缺少动作承接。",
                  revisionInstruction: "补足行动与钩子。",
                }),
              },
              {
                stepId: "producer",
                stepType: "agent",
                agentRoleId: "scene-novelizer-webnovel-writer",
                outputKey: "draft",
                output: "最终稿：柜台下风铃一响，林晏俯身扣住暗格，门外的脚步却忽然停了。",
                text: "最终稿：柜台下风铃一响，林晏俯身扣住暗格，门外的脚步却忽然停了。",
              },
            ],
            skippedSteps: [],
            output: {
              draft: "最终稿：柜台下风铃一响，林晏俯身扣住暗格，门外的脚步却忽然停了。",
            },
          },
        });
      }, 0);
      return { taskId };
    },
    listAgents: async () => ({ defaultAgentId: "mock", agents: [] }),
    answerQuestion: async () => undefined,
    abortTask: async () => undefined,
    listRuntimeSessions: async () => ({ sessions: [] }),
    getRuntimeSession: async () => ({ session: {} }),
    getCollaborationTimeline: async () => ({ session: {}, events: [] }),
  });
`, "utf8");

writeFileSync(entryPath, `
  import {
    runSceneNovelizer,
  } from ${JSON.stringify(runtimePath)};
  import {
    sceneNovelizerMockRuns,
  } from ${JSON.stringify(mockAgentClientPath)};

  const assert = (condition: unknown, message: string, details?: unknown) => {
    if (!condition) {
      const suffix = details === undefined ? "" : "\\n" + JSON.stringify(details, null, 2);
      throw new Error(message + suffix);
    }
  };

  const source = {
    id: "source-review-loop",
    title: "风铃暗格",
    platformStyleId: "fanqie",
    ruleOptionIds: [],
    sceneSummary: "酒馆柜台下传来异响。",
    sceneGoal: "确认声源并留下悬念。",
    sceneStatus: "进行中",
    userPersonaName: "旅人",
    materials: [
      {
        id: "material-1",
        turnIndex: 1,
        source: "user",
        kind: "user_action",
        visibility: "public",
        text: "用户听见柜台下传来轻响，示意林晏检查。",
        sourceMessageIds: ["message-1"],
      },
      {
        id: "material-2",
        turnIndex: 2,
        source: "character",
        kind: "dialogue",
        visibility: "public",
        text: "林晏：「我去柜台下看看。」",
        characterId: "char-a",
        characterName: "林晏",
        sourceMessageIds: ["message-2"],
      },
    ],
    confirmedFacts: ["柜台下有异响。"],
    unresolvedHooks: ["门外脚步忽然停住。"],
    constraints: {
      preserveUserActions: true,
      noNewKeyConclusion: true,
      thoughtMode: "user_visible_only",
      targetChars: 120,
      paragraphMaxChars: 160,
    },
    stats: {
      userActionCount: 1,
      characterBeatCount: 1,
      dialogueCount: 1,
      thoughtCount: 0,
      consequenceCount: 0,
      hookCount: 1,
    },
    createdAt: Date.now(),
  } as const;

  const draft = await runSceneNovelizer({
    workspacePath: "/tmp/novel-claw-scene-novelizer-review",
    agentId: "mock-agent",
    runtimeModel: {
      provider: "mock-provider",
      apiFormat: "openai-chat",
      catalogModelId: "mock-model",
      modelId: "mock-model",
    },
    source,
    autoRewrite: true,
  });

  const runInput = sceneNovelizerMockRuns[0];
  assert(sceneNovelizerMockRuns.length === 1, "scene novelizer 应只提交一次 collaboration mode", sceneNovelizerMockRuns);
  assert(runInput.type === "collaborationMode", "scene novelizer 应使用 collaboration mode", runInput);
  assert(runInput.mode === "producer.review-rewrite-loop", "scene novelizer 应使用 producer.review-rewrite-loop", runInput);
  assert(
    runInput.participants.map((participant: any) => participant.kind).join("|") === "producer|reviewer",
    "scene novelizer 应提交 producer/reviewer participants",
    runInput.participants,
  );
  assert(runInput.options?.maxRounds === 2, "autoRewrite=true 应允许一轮重写", runInput.options);
  assert(draft.text.includes("最终稿") && draft.text.includes("暗格"), "最终稿应取最后 draft output", draft);
  assert(draft.rewriteCount === 1, "rewriteCount 应按 producer 执行次数计算", draft);

  console.log(JSON.stringify({
    ok: true,
    mode: runInput.mode,
    participantKinds: runInput.participants.map((participant: any) => participant.kind),
    rewriteCount: draft.rewriteCount,
    text: draft.text,
  }, null, 2));
`, "utf8");

try {
  await build({
    entryPoints: [entryPath],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    outfile: bundledPath,
    alias: {
      "@/agent-client/runtime": mockAgentClientPath,
      "@": resolve(workspaceRoot, "src"),
    },
    plugins: [
      {
        name: "mock-scene-novelizer-agent-client",
        setup(build) {
          build.onResolve({ filter: /.*/ }, (args) => {
            if (
              args.path === "@/agent-client/runtime" ||
              args.path.endsWith("/agent-client/runtime")
            ) {
              return { path: mockAgentClientPath };
            }
            return null;
          });
        },
      },
    ],
  });

  await import(pathToFileURL(bundledPath).href);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
