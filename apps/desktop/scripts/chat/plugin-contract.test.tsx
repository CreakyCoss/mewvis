import * as ui from "../../src/chat/react";
import { usePluginChatSession } from "../../src/chat/react/plugin";
import type * as PublicUI from "@isle/plugin-sdk/chat/react";
// The published declarations must describe the actual shared implementation.
const publicUI: typeof PublicUI = { ...ui, usePluginChatSession };
void publicUI;
