import { create } from "zustand";
import type { ChatActiveTurn, ChatMessage, ChatPendingQuestion } from "./type";

type ChatStore = {
  chatId: string;
  messages: ChatMessage[];
  activeTurn: ChatActiveTurn | null;
  pendingQuestion: ChatPendingQuestion | null;
  isInitializing: boolean;
  error: string;
  initialize: (chatId: string) => void;
  hydrateMessages: (messages: ChatMessage[]) => void;
  setInitializing: (isInitializing: boolean) => void;
  addMessages: (messages: ChatMessage[]) => void;
  updateMessage: (messageId: string, update: (message: ChatMessage) => ChatMessage) => void;
  startTurn: (turn: ChatActiveTurn) => void;
  finishTurn: () => void;
  setPendingQuestion: (question: ChatPendingQuestion | null) => void;
  setError: (error: string) => void;
};

export const useChatStore = create<ChatStore>((set) => ({
  chatId: "",
  messages: [],
  activeTurn: null,
  pendingQuestion: null,
  isInitializing: true,
  error: "",
  initialize: (chatId) =>
    set({
      chatId,
      messages: [],
      activeTurn: null,
      pendingQuestion: null,
      isInitializing: true,
      error: "",
    }),
  hydrateMessages: (messages) => set({ messages }),
  setInitializing: (isInitializing) => set({ isInitializing }),
  addMessages: (messages) => set((state) => ({ messages: [...state.messages, ...messages] })),
  updateMessage: (messageId, update) =>
    set((state) => ({
      messages: state.messages.map((message) => (message.id === messageId ? update(message) : message)),
    })),
  startTurn: (activeTurn) => set({ activeTurn, pendingQuestion: null, error: "" }),
  finishTurn: () => set({ activeTurn: null, pendingQuestion: null }),
  setPendingQuestion: (pendingQuestion) => set({ pendingQuestion }),
  setError: (error) => set({ error }),
}));
