// Host-injected modules are built from the same source used by the application.
const ui = globalThis.islePluginChatUI;
if (!ui)
  throw new Error(
    "当前宿主未提供插件 Chat UI，请使用 Isle 插件打包工具并更新宿主",
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
  usePluginChatSession,
  MessagesView,
  MessageView,
  QuestionView,
  ComposerView,
  ComposerToolbar,
  ComposerActions,
} = ui;
