import {
  createTavernId,
  now,
} from "../../ids";
import type {
  TavernMessage,
} from "../../types";
import {
  buildTavernMessageSegments,
  inferTavernMessageKind,
} from "./segments";

export const createTavernMessage = (
  input: Omit<TavernMessage, "id" | "createdAt">,
): TavernMessage => {
  const message = {
    ...input,
    id: createTavernId("message"),
    createdAt: now(),
  };

  return materializeTavernMessage(message, message.presentationProfileId);
};

export const materializeTavernMessage = (
  message: TavernMessage,
  presentationProfileId: TavernMessage["presentationProfileId"],
): TavernMessage => {
  const nextMessage = {
    ...message,
    presentationProfileId: message.presentationProfileId ?? presentationProfileId,
  };

  return {
    ...nextMessage,
    kind: nextMessage.kind ?? inferTavernMessageKind({
      role: nextMessage.role,
      presentationProfileId: nextMessage.presentationProfileId,
    }),
    segments: nextMessage.segments ?? buildTavernMessageSegments(nextMessage),
  };
};
