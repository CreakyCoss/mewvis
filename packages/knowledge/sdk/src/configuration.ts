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
/** Type/validation contract only. The SDK does not create databases, services or provider drivers. */
export type KnowledgeServiceConfiguration =
  | {
      readonly backend: KnowledgeSqliteBackend | KnowledgeMongodbBackend;
      readonly embedding?: KnowledgeEmbeddingConfiguration;
    }
  | { readonly backend: KnowledgeRemoteBackend; readonly embedding?: never };

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

/** Structural validation only; no network, filesystem access, credential resolution or service initialization. */
export function parseKnowledgeServiceConfiguration(
  value: unknown,
): KnowledgeServiceConfiguration {
  const config = s.copyJson(value, "INVALID_ARGUMENT");
  s.union(
    s.object({ backend: s.union(sqlite, mongodb), embedding: opt(embedding) }),
    s.object({ backend: remote }),
  ).check(config, "configuration", "INVALID_ARGUMENT");
  return s.freeze(config) as KnowledgeServiceConfiguration;
}
