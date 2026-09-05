export const fake = {
  record: null as any,
  writes: [] as any[],
  runs: [] as any[],
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
export const isTauri = () => true;
export async function invoke(command: string, args?: { input: any }) {
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
export async function loadChat() {
  if (fake.failLoad) throw new Error("broken file");
  return structuredClone(fake.record);
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
      async subscribe() {
        return () => {};
      },
    },
    capabilities: {
      async listAgentTools() {
        return { tools: [], defaultToolNames: [] };
      },
    },
    agent: {
      async run(input: any) {
        fake.runs.push(input);
      },
    },
    tasks: { async abort() {}, async answerQuestion() {} },
  };
}
