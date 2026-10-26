/** Host-only bootstrap configuration. Never send these objects through an application business transport. */
import type { KnowledgeMetadata } from "./contracts.js";
import * as s from "./validation.js";

export interface KnowledgeSqliteBackend {
  readonly kind: "sqlite";
  /** Caller-owned data directory. No implicit home directory, host database or memory fallback. */
  readonly directory: string;
}
export interface KnowledgeMongodbBackend {
  readonly kind: "mongodb";
  /** Credential-free mongodb:// or mongodb+srv:// URI. The adapter validates driver-specific options. */
  readonly uri: string;
  readonly database: string;
  readonly credentialRef?: string;
}
export interface KnowledgeRemoteBackend {
  readonly kind: "remote";
  /** Adapter ID, e.g. a future Mewvis-protocol adapter or a third-party knowledge service adapter. */
  readonly provider: string;
  readonly endpoint: string;
  readonly credentialRef?: string;
  /** Provider-specific target/namespace configuration, interpreted only by that adapter. */
  readonly options?: KnowledgeMetadata;
}
export type KnowledgeBackendConfiguration =
  KnowledgeSqliteBackend | KnowledgeMongodbBackend | KnowledgeRemoteBackend;
export interface KnowledgeEmbeddingConfiguration {
  readonly provider: string;
  readonly endpoint: string;
  readonly model: string;
  readonly dimensions?: number;
  readonly credentialRef?: string;
  /** Query/document input formats and provider parameters are adapter-owned. */
  readonly options?: KnowledgeMetadata;
}

export interface KnowledgeLocalAttachmentStorage {
  readonly kind: "local";
  /** Stable binding for persisted attachment records; changing the location requires an explicit move. */
  readonly storageId: string;
  /** Caller-owned original-file directory, independent of the metadata database directory. */
  readonly directory: string;
}
export interface KnowledgeObjectAttachmentStorage {
  readonly kind: "object-storage";
  readonly storageId: string;
  /** Adapter ID, e.g. "aliyun-oss" or "s3-compatible"; this is not a claim that a driver is bundled. */
  readonly provider: string;
  readonly bucket: string;
  readonly endpoint?: string;
  readonly region?: string;
  readonly prefix?: string;
  readonly credentialRef?: string;
  readonly options?: KnowledgeMetadata;
}
export interface KnowledgeCustomAttachmentStorage {
  readonly kind: "custom";
  readonly storageId: string;
  readonly provider: string;
  readonly credentialRef?: string;
  /** Non-secret adapter configuration; credentials are resolved by the caller. */
  readonly options?: KnowledgeMetadata;
}
/** Original bytes and metadata storage are independently selected by the caller. No implicit local fallback. */
export type KnowledgeAttachmentStorageConfiguration =
  | KnowledgeLocalAttachmentStorage
  | KnowledgeObjectAttachmentStorage
  | KnowledgeCustomAttachmentStorage;

/** Type/validation contract only. The SDK does not create databases, services or provider drivers. */
export type KnowledgeServiceConfiguration =
  | {
      readonly backend: KnowledgeSqliteBackend | KnowledgeMongodbBackend;
      readonly embedding?: KnowledgeEmbeddingConfiguration;
      readonly attachmentStorage?: KnowledgeAttachmentStorageConfiguration;
    }
  | {
      readonly backend: KnowledgeRemoteBackend;
      readonly embedding?: never;
      /** A delegated knowledge service owns its attachment storage as well. */
      readonly attachmentStorage?: never;
    };

const opt = s.optional;
const endpoint = s.refine(s.text, (value) => {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.hash
    );
  } catch {
    return false;
  }
});
const sqlite = s.object({ kind: s.literal("sqlite"), directory: s.text });
const mongodb = s.object({
  kind: s.literal("mongodb"),
  database: s.text,
  credentialRef: opt(s.text),
  uri: s.refine(
    s.text,
    (value) =>
      /^mongodb(?:\+srv)?:\/\/[^\s/]+(?:\/[^\s]*)?$/.test(value) &&
      !value.split("://")[1]?.split("/")[0]?.includes("@") &&
      !value.includes("#"),
  ),
});
const remote = s.object({
  kind: s.literal("remote"),
  provider: s.text,
  endpoint,
  credentialRef: opt(s.text),
  options: opt(s.metadata),
});
const embedding = s.object({
  provider: s.text,
  endpoint,
  model: s.text,
  dimensions: opt(s.positive),
  credentialRef: opt(s.text),
  options: opt(s.metadata),
});
const attachmentStorage = s.union(
  s.object({
    kind: s.literal("local"),
    storageId: s.text,
    directory: s.text,
  }),
  s.object({
    kind: s.literal("object-storage"),
    storageId: s.text,
    provider: s.text,
    bucket: s.text,
    endpoint: opt(endpoint),
    region: opt(s.text),
    prefix: opt(s.string),
    credentialRef: opt(s.text),
    options: opt(s.metadata),
  }),
  s.object({
    kind: s.literal("custom"),
    storageId: s.text,
    provider: s.text,
    credentialRef: opt(s.text),
    options: opt(s.metadata),
  }),
);

/** Validates configuration only; resolving adapters/credentials and opening storage belong to the service runtime. */
export function parseKnowledgeAttachmentStorageConfiguration(
  value: unknown,
): KnowledgeAttachmentStorageConfiguration {
  const config = s.copyJson(value, "INVALID_ARGUMENT");
  attachmentStorage.check(config, "attachmentStorage", "INVALID_ARGUMENT");
  return s.freeze(config) as KnowledgeAttachmentStorageConfiguration;
}

/** Structural validation only; no network, filesystem access, credential resolution or service initialization. */
export function parseKnowledgeServiceConfiguration(
  value: unknown,
): KnowledgeServiceConfiguration {
  const config = s.copyJson(value, "INVALID_ARGUMENT");
  s.union(
    s.object({
      backend: s.union(sqlite, mongodb),
      embedding: opt(embedding),
      attachmentStorage: opt(attachmentStorage),
    }),
    s.object({ backend: remote }),
  ).check(config, "configuration", "INVALID_ARGUMENT");
  return s.freeze(config) as KnowledgeServiceConfiguration;
}
