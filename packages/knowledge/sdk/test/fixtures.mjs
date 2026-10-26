export const time = "2026-10-26T00:00:00.000Z";
export const capabilities = {
  methods: ["service.describe", "service.probe", "search"],
  searchModes: ["keyword", "vector", "hybrid"],
  filterOperators: ["eq", "and"],
  idempotency: true,
};
export const base = {
  id: "base-a",
  name: "星图资料",
  state: "ready",
  capabilities,
};
export const summary = {
  id: "doc-a",
  knowledgeBaseId: base.id,
  externalId: "star-chart",
  title: "星图记录",
  state: "ready",
  revision: "r1",
  source: { uri: "urn:documents:star-chart", mediaType: "text/plain" },
};
export const document = { ...summary, text: "蓝鹭计划的档案存放于北塔。" };
export const chunk = {
  id: "chunk-a",
  knowledgeBaseId: base.id,
  documentId: document.id,
  documentRevision: "r1",
  ordinal: 0,
  title: document.title,
  text: document.text,
  source: document.source,
  location: { page: 2, lines: { start: 4, end: 4 } },
};
export const job = {
  id: "job-a",
  knowledgeBaseId: base.id,
  kind: "import",
  state: "queued",
  progress: { total: 1, processed: 0, failed: 0, skipped: 0 },
  createdAt: time,
  updatedAt: time,
};
export const search = {
  hits: [
    {
      id: "evidence-a",
      knowledgeBaseId: base.id,
      documentId: document.id,
      documentRevision: "r1",
      chunkId: chunk.id,
      title: chunk.title,
      text: chunk.text,
      source: chunk.source,
      location: chunk.location,
      score: { value: -2.78, kind: "relevance", higherIsBetter: false },
    },
  ],
  diagnostics: {
    status: "complete",
    elapsedMs: 3,
    targets: [
      { knowledgeBaseId: base.id, status: "ok", indexRevision: "index-1" },
    ],
    warnings: [],
  },
};
export const success = (value) => ({ version: 1, ok: true, value });
export const failure = (code, message = code) => ({
  version: 1,
  ok: false,
  error: { code, message },
});
export const copy = (value) => JSON.parse(JSON.stringify(value));
