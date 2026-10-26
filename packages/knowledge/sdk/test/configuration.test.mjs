import test from "node:test";
import assert from "node:assert/strict";
import { parseKnowledgeServiceConfiguration } from "@mewvis/knowledge-sdk/configuration";

test("caller-selected backends are explicit, isolated host configuration", () => {
  const configs = [
    { backend: { kind: "sqlite", directory: "/caller/owned/knowledge" } },
    {
      backend: {
        kind: "mongodb",
        uri: "mongodb://localhost:27017/?replicaSet=rs0",
        database: "knowledge_c",
        credentialRef: "mongo-secret",
      },
      embedding: {
        provider: "cloud-adapter",
        endpoint: "https://embedding.example/v1",
        model: "model-a",
        dimensions: 768,
        credentialRef: "embedding-secret",
      },
    },
    {
      backend: {
        kind: "remote",
        provider: "mewvis-v1",
        endpoint: "https://knowledge.example/rpc",
        credentialRef: "remote-secret",
        options: { namespace: "b" },
      },
    },
  ];
  for (const config of configs) {
    const result = parseKnowledgeServiceConfiguration(config);
    assert.deepEqual(result, config);
    assert.notEqual(result.backend, config.backend);
    assert.ok(Object.isFrozen(result.backend));
    assert.ok(!Object.isFrozen(config.backend));
  }
});

test("configuration validation does not invent storage or accept secrets in public fields", () => {
  for (const config of [
    {},
    { backend: {} },
    { backend: { kind: "sqlite", directory: " " } },
    {
      backend: { kind: "sqlite", directory: "/a", hostDatabase: "/config.db" },
    },
    {
      backend: {
        kind: "mongodb",
        uri: "mongodb://user:password@localhost:27017",
        database: "a",
      },
    },
    { backend: { kind: "mongodb", uri: "http://localhost", database: "a" } },
    {
      backend: {
        kind: "remote",
        provider: "service",
        endpoint: "file:///data",
      },
    },
    {
      backend: {
        kind: "remote",
        provider: "service",
        endpoint: "https://user:password@example.com",
      },
    },
    {
      backend: {
        kind: "remote",
        provider: "service",
        endpoint: "https://example.com",
        apiKey: "secret",
      },
    },
    {
      backend: {
        kind: "remote",
        provider: "service",
        endpoint: "https://example.com",
      },
      embedding: {
        provider: "other",
        endpoint: "https://example.com",
        model: "other",
      },
    },
    {
      backend: { kind: "sqlite", directory: "/a" },
      embedding: {
        provider: "cloud",
        endpoint: "https://example.com",
        model: "m",
        dimensions: 0,
      },
    },
  ])
    assert.throws(
      () => parseKnowledgeServiceConfiguration(config),
      (error) => error.code === "INVALID_ARGUMENT",
    );
});
