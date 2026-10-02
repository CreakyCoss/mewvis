// Host-injected modules are built from the same source used by the application.
const ui = globalThis.mewvisApplicationChatUI;
if (!ui)
  throw new Error(
    "当前宿主未提供应用 Chat UI，请使用 Mewvis 应用打包工具并更新宿主",
  );
export const {
  Chat,
  ChatEnvironment,
  useChatSession,
  useChatSnapshot,
  useChatActions,
  useChatComposer,
  useChatControls,
  useChatViewState,
  useApplicationChatSession,
  MessagesView,
  MessageView,
  QuestionView,
  ComposerView,
  ComposerToolbar,
  ComposerActions,
} = ui;
