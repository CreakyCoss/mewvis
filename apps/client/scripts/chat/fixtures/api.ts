import { agentPermissionOptions } from "../../../src/agent-client/wire";
export const fake = {
  permissionOptions: structuredClone([...agentPermissionOptions]),
  record: null as any,
  writes: [] as any[],
  runs: [] as any[],
  events: new Set<(event: any) => void>(),
  metas: [] as any[],
  list: undefined as (() => Promise<any[]>) | undefined,
  failTools: false,
  failSave: false,
  failUnread: false,
  failLoad: false,
  pending: 0,
  maxPending: 0,
  llmReads: 0,
  llmSaves: 0,
  summaries: [] as any[],
  readLlm: undefined as (() => Promise<any>) | undefined,
  saveLlm: undefined as ((input: any) => Promise<any>) | undefined,
  llmSettings: {
    providers: [
      {
        id: "provider",
        name: "Provider",
        provider: "mock",
        apiFormat: "openai-completions",
        apiKey: "secret-must-not-reach-ui",
        isDefault: true,
        models: [{ id: "model", modelId: "mock", modelName: "Mock", isEnabled: true }],
      },
    ],
  } as any,
};
export async function listen() {
  throw new Error("Unexpected backend event subscription");
}
export async function invoke(command: string, args?: { input: any }) {
  if (command === "release_agent_runtime_session") return;
  if (command === "get_llm_settings") {
    fake.llmReads++;
    return fake.readLlm ? fake.readLlm() : structuredClone(fake.llmSettings);
  }
  if (command === "save_llm_settings") {
    fake.llmSaves++;
    const settings = fake.saveLlm ? await fake.saveLlm(args!.input) : args!.input;
    fake.llmSettings = structuredClone(settings);
    return structuredClone(settings);
  }
  throw new Error(`Unexpected native fixture command: ${command}`);
}
export async function summarizeLedger(input: any) {
  fake.summaries.push(input);
  return null;
}
export async function getAiAgentSettings() {
  return { agents: [], collaborationWorkflows: [] };
}
export async function getSkills() {
  return {
    skills: [
      { key: "skill", name: "skill", content: "private skill body", path: "/skills/private", description: "Skill" },
    ],
    groups: [{ id: "group", name: "Group", skills: [{ key: "skill" }] }],
    defaultGroupId: "group",
  };
}
export async function listKnowledgeLibrary() {
  return { collections: [{ id: "knowledge", name: "Knowledge", enabled: true, order: 0, createdAt: 0 }], sources: [] };
}
export async function loadChat(_workspacePath?: string, chatId?: string) {
  if (fake.failLoad) throw new Error("broken file");
  return structuredClone(fake.record?.id === chatId || !chatId ? fake.record : null);
}
export async function listChats() {
  return fake.list ? fake.list() : structuredClone(fake.metas);
}
export async function saveChat(input: any) {
  fake.pending++;
  fake.maxPending = Math.max(fake.maxPending, fake.pending);
  try {
    await new Promise((resolve) => setTimeout(resolve, 2));
    if (fake.failSave) throw new Error("disk full");
    fake.record = { id: input.chatId, createdAt: 1, updatedAt: 2, ...input };
    fake.writes.push(structuredClone(input));
    return structuredClone(fake.record);
  } finally {
    fake.pending--;
  }
}
export async function setChatUnread(input: any) {
  if (fake.failUnread) throw new Error("unread write failed");
  fake.record.isUnread = input.isUnread;
}
export async function searchEnabledKnowledge() {
  return null;
}
export function createAgentClient() {
  return {
    events: {
      async subscribe(listener: (event: any) => void) {
        fake.events.add(listener);
        return () => {
          fake.events.delete(listener);
        };
      },
    },
    capabilities: {
      async listAgentTools() {
        return {
          tools: [
            { name: "own", label: "Own tool" },
            { name: "host", label: "Host tool" },
          ],
          defaultToolNames: [],
          permissionOptions: structuredClone(fake.permissionOptions),
        };
      },
    },
    agent: {
      async run(input: any) {
        fake.runs.push(input);
      },
    },
    tasks: { async abort() {}, async answerQuestion() {}, async answerApproval() {} },
  };
}

// Workspace state tests use the same host boundary without opening runtime sessions.
export const unreadUpdates: { workspacePath: string; chatId: string; isUnread: boolean }[] = [];
export const chatService = {
  async setUnread(workspacePath: string, chatId: string, isUnread: boolean) {
    unreadUpdates.push({ workspacePath, chatId, isUnread });
  },
  async closeRecord() {
    return { ok: true };
  },
  async closeWorkspace() {
    return { ok: true };
  },
};
export async function deleteChat() {}
