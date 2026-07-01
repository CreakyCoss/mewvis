import type { CollaborationExecutorId } from "../../protocol/index.js";
import { mockRuntimeAgent } from "./agent/runtimes/mock/index.js";
import { runtimeAgentManifest } from "./agent/runtimes/registry.js";
import {
  collaborationExecutorManifest,
} from "./collaboration/executors/index.js";
import { runtimeSessionProviderManifest } from "./session/providers/registry.js";
import type { RuntimeSessionProviderId } from "./session/providers/types.js";

export type NativeRuntimeProfileId = "default" | (string & {});

export type NativeRuntimeProfile = {
  id: NativeRuntimeProfileId;
  label: string;
  agentRuntimeId: string;
  chatRuntimeId: string;
  collaborationExecutorId: CollaborationExecutorId;
  sessionProviderId: RuntimeSessionProviderId;
};

const defaultNativeRuntimeProfile = Object.freeze({
  id: "default",
  label: "Pi + LangGraph + Jsonl",
  agentRuntimeId: runtimeAgentManifest.defaultAgentId,
  chatRuntimeId: runtimeAgentManifest.defaultAgentId,
  collaborationExecutorId: collaborationExecutorManifest.defaultExecutorId,
  sessionProviderId: runtimeSessionProviderManifest.defaultProviderId,
} satisfies NativeRuntimeProfile);

const mockNativeRuntimeProfile = Object.freeze({
  id: mockRuntimeAgent.id,
  label: "Mock + LangGraph + Jsonl",
  agentRuntimeId: mockRuntimeAgent.id,
  chatRuntimeId: mockRuntimeAgent.id,
  collaborationExecutorId: collaborationExecutorManifest.defaultExecutorId,
  sessionProviderId: runtimeSessionProviderManifest.defaultProviderId,
} satisfies NativeRuntimeProfile);

const nativeRuntimeProfiles = Object.freeze([
  defaultNativeRuntimeProfile,
  mockNativeRuntimeProfile,
]);

const nativeRuntimeProfileRegistry: Readonly<Record<string, NativeRuntimeProfile>> =
  Object.freeze(Object.fromEntries(
    nativeRuntimeProfiles.map((profile) => [profile.id, profile]),
  ));

export const nativeRuntimeProfileManifest = Object.freeze({
  defaultProfileId: defaultNativeRuntimeProfile.id,
  profiles: Object.freeze(nativeRuntimeProfiles.map(({ id, label }) => ({
    id,
    label,
  }))),
});

export const resolveNativeRuntimeProfile = (
  profileId?: string | null,
): NativeRuntimeProfile => {
  const id = profileId?.trim() || nativeRuntimeProfileManifest.defaultProfileId;
  const profile = nativeRuntimeProfileRegistry[id];
  if (!profile) {
    throw new Error(`未知 native runtime profile：${id}`);
  }

  return profile;
};
