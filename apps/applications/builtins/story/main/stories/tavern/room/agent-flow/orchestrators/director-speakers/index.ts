import { buildTavernAgentFlowContext } from "./context";
import { runTavernAgentFlowDirector } from "./director";
import { appendSpeakerPublicMessage, runTavernAgentFlowSpeaker } from "./speaker";
import { createTimestampId } from "@/utils/ids";
import { getCurrentTimestamp } from "@/utils/time";
import {
  createTavernAgentOutputMessageBody,
  type TavernMessage,
} from "@/stories/tavern/room/model/message";
import { runTavernAgentFlowRuntimeAgent } from "../../runtime/agent";
import type {
  TavernAgentFlowDirectorSpeakersResult,
  TavernAgentFlowInput,
  TavernAgentFlowSpeakerResult,
} from "../../types";
import type { TavernAgentFlowOrchestrator } from "../registry";

export const directorSpeakersOrchestrator: TavernAgentFlowOrchestrator = {
  id: "director-speakers",
  run: runDirectorSpeakers,
};

const resolveScheduledCharacters = (input: TavernAgentFlowInput, speakerIds: string[]) => {
  const characterById = new Map(input.story.characters.map((character) => [character.id, character]));
  return speakerIds.map((speakerId) => characterById.get(speakerId)!);
};

const createDirectorNarratorMessage = ({
  input,
  presentationId,
  rawText,
  narrativeText,
}: {
  input: TavernAgentFlowInput;
  presentationId: TavernAgentFlowDirectorSpeakersResult["presentation"]["id"];
  rawText: string;
  narrativeText: string;
}): TavernMessage | undefined => {
  if (!narrativeText.trim()) {
    return undefined;
  }

  return {
    id: createTimestampId("msg"),
    roomId: input.story.roomConfig.id,
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

async function runDirectorSpeakers(input: TavernAgentFlowInput): Promise<TavernAgentFlowDirectorSpeakersResult> {
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
    : ([] as TavernAgentFlowDirectorSpeakersResult["publicMessages"]);

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
    orchestration: "director-speakers",
    presentation: context.presentation,
    director,
    narratorMessage,
    speakers,
    messages: [...(narratorMessage ? [narratorMessage] : []), ...speakers.map((speaker) => speaker.message)],
    publicMessages,
  };
}
