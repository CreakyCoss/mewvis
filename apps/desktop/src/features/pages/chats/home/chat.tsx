import { Chat } from "../chat";
import type { ChatInputResources, ChatInputSubmitPayload } from "../components/chat-input/type";

export type HomeChatProps = {
  initialMessage: ChatInputSubmitPayload;
  inputResources: ChatInputResources;
};

export const HomeChat = ({ initialMessage, inputResources }: HomeChatProps) => (
  <Chat
    initialMessages={[initialMessage]}
    inputResources={inputResources}
    inputDefaultOptionValues={initialMessage.optionValues}
  />
);
