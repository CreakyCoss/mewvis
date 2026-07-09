import type { TavernMessage } from "@/features/pages/taverns/tavern/types";
import { createTimestampId } from "@/utils/ids";
import { getCurrentTimestamp } from "@/utils/time";

export const createTavernMessage = (input: Omit<TavernMessage, "id" | "createdAt">): TavernMessage => {
  const message = {
    ...input,
    id: createTimestampId("message"),
    createdAt: getCurrentTimestamp(),
  };

  return materializeTavernMessage(message, message.presentationProfileId);
};

export const materializeTavernMessage = (
  message: TavernMessage,
  presentationProfileId: TavernMessage["presentationProfileId"],
): TavernMessage => {
  return {
    ...message,
    presentationProfileId: message.presentationProfileId ?? presentationProfileId,
  };
};
