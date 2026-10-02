import type { ExtensionDefinition as SDKAgent } from "@mewvis/extension-sdk/agent";
import type { ExtensionUIDefinition as SDKUI } from "@mewvis/extension-sdk/ui";
import type { ExtensionDefinition as NativeAgent } from "@mewvis/extension-host/agent";
import type { ExtensionUIDefinition as NativeUI } from "@mewvis/extension-host/ui";
export function adaptAgentExtension(definition: SDKAgent): NativeAgent;
export function adaptUIExtension(definition: SDKUI): NativeUI;
