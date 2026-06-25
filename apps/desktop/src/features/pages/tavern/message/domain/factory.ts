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

  return {
    ...message,
    kind: message.kind ?? inferTavernMessageKind({
      role: message.role,
      presentationProfileId: message.presentationProfileId,
    }),
    segments: message.segments ?? buildTavernMessageSegments(message),
  };
};
