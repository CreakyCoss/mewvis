import { buildTavernAgentFlowContext } from "./context";
import { runTavernAgentFlowDirector } from "./director";
import { runTavernAgentFlowRuntimeAgent } from "./runtime-agent";
import { appendSpeakerPublicMessage, runTavernAgentFlowSpeaker } from "./speakers";
import { createTimestampId } from "@/utils/ids";
import { getCurrentTimestamp } from "@/utils/time";
import type { TavernMessage } from "@/features/pages/taverns/tavern/types";
import { createTavernAgentOutputMessageBody } from "@/features/pages/taverns/room/model/message-body";
import type { TavernAgentFlowInput, TavernAgentFlowResult, TavernAgentFlowSpeakerResult } from "./types";

const resolveScheduledCharacters = (input: TavernAgentFlowInput, speakerIds: string[]) => {
  const characterById = new Map(input.characters.map((character) => [character.id, character]));
  return speakerIds.flatMap((speakerId) => {
    const character = characterById.get(speakerId);
    return character ? [character] : [];
  });
};

const createDirectorNarratorMessage = ({
  input,
  presentationId,
  rawText,
  narrativeText,
}: {
  input: TavernAgentFlowInput;
  presentationId: TavernAgentFlowResult["presentation"]["id"];
  rawText: string;
  narrativeText: string;
}): TavernMessage | undefined => {
  if (!narrativeText.trim()) {
    return undefined;
  }

  return {
    id: createTimestampId("msg"),
    roomId: input.room.identity.id,
    turnId: input.turnId,
    role: "narrator",
    kind: "director_narration",
    presentationProfileId: presentationId,
    body: createTavernAgentOutputMessageBody({
      rawText,
      output: ["privateThought", "decision", "narrative", "summary"],
    }),
    createdAt: getCurrentTimestamp(),
    status: "done",
  };
};

export const runTavernAgentFlow = async (input: TavernAgentFlowInput): Promise<TavernAgentFlowResult> => {
  const context = buildTavernAgentFlowContext(input);
  const runAgent = input.runAgent ?? runTavernAgentFlowRuntimeAgent;
  const director = await runTavernAgentFlowDirector({
    input,
    context,
    runAgent,
  });
  const scheduledCharacters = resolveScheduledCharacters(input, director.decision.speakerIds);
  const narratorMessage = createDirectorNarratorMessage({
    input,
    presentationId: context.presentation.id,
    rawText: director.rawText,
    narrativeText: director.decision.narratorText ?? "",
  });
  const narratorText = director.decision.narratorText?.trim() ?? "";
  const speakers: TavernAgentFlowSpeakerResult[] = [];
  let publicMessages = narratorMessage
    ? [
        {
          role: "narrator" as const,
          speaker: "旁白",
          content: narratorText,
          visibility: "public" as const,
          createdAt: narratorMessage.createdAt,
        },
      ]
    : ([] as TavernAgentFlowResult["publicMessages"]);

  if (narratorMessage) {
    input.onEvent?.({ type: "director_narrator", text: narratorText });
  }

  for (const [index, character] of scheduledCharacters.entries()) {
    const speakerResult = await runTavernAgentFlowSpeaker({
      input,
      context,
      character,
      previousPublicMessages: publicMessages,
      index,
      runAgent,
    });
    speakers.push(speakerResult);
    publicMessages = appendSpeakerPublicMessage({
      messages: publicMessages,
      character,
      publicText: speakerResult.publicText,
    });
  }

  return {
    presentation: context.presentation,
    director,
    narratorMessage,
    speakers,
    messages: [...(narratorMessage ? [narratorMessage] : []), ...speakers.map((speaker) => speaker.message)],
    publicMessages,
  };
};
