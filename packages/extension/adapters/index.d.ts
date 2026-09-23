import type { ExtensionDefinition as SDKAgent } from "@isle/extension-sdk/agent";
import type { ExtensionUIDefinition as SDKUI } from "@isle/extension-sdk/ui";
import type { ExtensionDefinition as NativeAgent } from "@isle/extension-host/agent";
import type { ExtensionUIDefinition as NativeUI } from "@isle/extension-host/ui";
export function adaptAgentExtension(definition: SDKAgent): NativeAgent;
export function adaptUIExtension(definition: SDKUI): NativeUI;
