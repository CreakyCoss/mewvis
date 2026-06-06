import type { UpdateMessage } from "./types";

export const createMessageStreamAccumulator = ({
  messageId,
  updateMessage,
}: {
  messageId: string;
  updateMessage: UpdateMessage;
}) => {
  let pendingTextDelta = "";
  let pendingThinkingDelta = "";
  let streamedText = "";
  let streamedThinking = "";
  let streamFlushFrameId: number | null = null;

  const flushStreamDeltas = () => {
    streamFlushFrameId = null;
    const textDelta = pendingTextDelta;
    const thinkingDelta = pendingThinkingDelta;
    pendingTextDelta = "";
    pendingThinkingDelta = "";

    if (!textDelta && !thinkingDelta) {
      return;
    }

    updateMessage(messageId, (message) => ({
      ...message,
      text: textDelta ? `${message.text}${textDelta}` : message.text,
      thinking: thinkingDelta ? `${message.thinking ?? ""}${thinkingDelta}` : message.thinking,
      status: "streaming",
    }));
  };

  const scheduleStreamFlush = () => {
    if (streamFlushFrameId === null) {
      streamFlushFrameId = window.requestAnimationFrame(flushStreamDeltas);
    }
  };

  const flushPendingStreamDeltas = () => {
    if (streamFlushFrameId !== null) {
      window.cancelAnimationFrame(streamFlushFrameId);
      streamFlushFrameId = null;
    }
    flushStreamDeltas();
  };

  return {
    appendTextDelta: (delta: string) => {
      streamedText += delta;
      pendingTextDelta += delta;
      scheduleStreamFlush();
    },
    appendThinkingDelta: (delta: string) => {
      streamedThinking += delta;
      pendingThinkingDelta += delta;
      scheduleStreamFlush();
    },
    flushPendingStreamDeltas,
    getStreamedText: () => streamedText,
    getStreamedThinking: () => streamedThinking,
  };
};
