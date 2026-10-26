import test from "node:test";
import assert from "node:assert/strict";
import {
  parseKnowledgeServiceConfiguration,
  parseKnowledgeAttachmentStorageConfiguration,
} from "@mewvis/knowledge-sdk/configuration";

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

test("original storage is caller-selected independently from metadata storage and only references credentials", () => {
  for (const attachmentStorage of [
    {
      kind: "local",
      storageId: "originals-v1",
      directory: "/caller/owned/originals",
    },
    {
      kind: "object-storage",
      storageId: "originals-v1",
      provider: "aliyun-oss",
      bucket: "originals",
      region: "cn-hangzhou",
      credentialRef: "oss-credentials",
      prefix: "knowledge/",
    },
    {
      kind: "object-storage",
      storageId: "originals-v2",
      provider: "s3-compatible",
      bucket: "originals",
      endpoint: "https://objects.example",
      options: { forcePathStyle: true },
    },
    {
      kind: "custom",
      storageId: "originals-v3",
      provider: "caller-storage",
      credentialRef: "storage-credentials",
      options: { namespace: "a" },
    },
  ]) {
    const original =
      parseKnowledgeAttachmentStorageConfiguration(attachmentStorage);
    assert.deepEqual(original, attachmentStorage);
    assert.ok(Object.isFrozen(original));
    assert.notEqual(original, attachmentStorage);
    const config = parseKnowledgeServiceConfiguration({
      backend: { kind: "sqlite", directory: "/caller/metadata" },
      attachmentStorage,
    });
    assert.deepEqual(config.attachmentStorage, attachmentStorage);
    assert.ok(Object.isFrozen(config.attachmentStorage));
  }
  for (const config of [
    {},
    { kind: "local", directory: "/a" },
    { kind: "local", storageId: "a", directory: " " },
    { kind: "object-storage", storageId: "a", provider: "oss" },
    {
      kind: "object-storage",
      storageId: "a",
      provider: "oss",
      bucket: "b",
      accessKeySecret: "secret",
    },
    {
      kind: "object-storage",
      storageId: "a",
      provider: "s3",
      bucket: "b",
      endpoint: "https://user:password@example.com",
    },
    {
      kind: "object-storage",
      storageId: "a",
      provider: "s3",
      bucket: "b",
      endpoint: "file:///data",
    },
    { kind: "custom", storageId: "a", provider: " " },
  ])
    assert.throws(
      () => parseKnowledgeAttachmentStorageConfiguration(config),
      (error) => error.code === "INVALID_ARGUMENT",
    );
  assert.throws(
    () =>
      parseKnowledgeServiceConfiguration({
        backend: {
          kind: "remote",
          provider: "mewvis-v1",
          endpoint: "https://knowledge.example/rpc",
        },
        attachmentStorage: { kind: "local", storageId: "a", directory: "/a" },
      }),
    (error) => error.code === "INVALID_ARGUMENT",
  );
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
