import * as ui from "../../src/chat/react";
import { usePluginChatSession } from "../../src/chat/react/plugin";
import type * as PublicUI from "@isle/plugin-sdk/chat/react";
// Verify both directions so published signatures cannot drift or silently become less precise.
const sharedUI = { ...ui, usePluginChatSession };
const publicUI: typeof PublicUI = sharedUI;
const applicationUI: Pick<typeof sharedUI, keyof typeof PublicUI> = publicUI;
void publicUI;
void applicationUI;
