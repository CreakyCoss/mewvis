import * as ui from "../../src/chat/react";
import { useApplicationChatSession } from "../../src/chat/react/application";
import type * as PublicUI from "@isle/app-sdk/chat/react";
// Verify both directions so published signatures cannot drift or silently become less precise.
const sharedUI = { ...ui, useApplicationChatSession };
const publicUI: typeof PublicUI = sharedUI;
const applicationUI: Pick<typeof sharedUI, keyof typeof PublicUI> = publicUI;
void publicUI;
void applicationUI;
