import { createKnowledgeService } from "@mewvis/knowledge-service";
const directory = process.argv[2];
let receipt;
const service = await createKnowledgeService(
  { backend: { kind: "sqlite", directory } },
  {
    embedding: {
      signature: "crash-test",
      dimensions: 3,
      async embed() {
        process.stdout.write(JSON.stringify(receipt), () => process.exit(0));
        return new Promise(() => {});
      },
    },
  },
);
const base = await service.bases.create({ name: "crash recovery" });
receipt = await service.documents.import({
  knowledgeBaseId: base.id,
  documents: [
    { title: "recover", text: "archive recovery", externalId: "recover" },
  ],
});
