import type { CSSProperties } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { getTavernPresentationProfile } from "@/workbench/pages/stories/tavern/presets/prompts/presentation-rules";
import { Composer } from "../composer";
import { isTavernRoomSending, useTavernRoomContext } from "../context";
import { ExecutionTrace } from "./execution-trace";
import { Message } from "../message";
import type { MessageCharacterProfile, MessageRenderInput } from "../message/types";
import { createTavernAgentOutputFieldMessageBody } from "../model/message";
import { ChapterContextCard } from "./chapter-context-card";

type TavernRoomContentProps = {
  isOpen: boolean;
  isSidePanelOpen: boolean;
};

export const TavernRoomContent = ({ isOpen, isSidePanelOpen }: TavernRoomContentProps) => {
  const story = useTavernRoomContext((store) => store.story);
  const messages = useTavernRoomContext((store) => store.messages);
  const visualPreset = useTavernRoomContext((store) => store.visualPreset);
  const busy = useTavernRoomContext((store) => store.busy);
  const executionSteps = useTavernRoomContext((store) => store.executionSteps);
  const executionTraceAnchorMessageId = useTavernRoomContext((store) => store.executionTraceAnchorMessageId);
  const messageViewportRef = useRef<HTMLDivElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const openingMessageCreatedAt = useMemo(() => Date.now(), [story?.chapterId, story?.roomConfig.id]);

  const renderableRoomMessages = useMemo(() => {
    if (!story) {
      return [];
    }

    const characterProfiles: MessageCharacterProfile[] = story.characters.map((character) => ({
      id: character.id,
      name: character.name,
      avatar: character.avatar,
    }));
    const openingProfile = getTavernPresentationProfile(story.roomConfig.presentation.profileId);
    const openingMessage: MessageRenderInput = {
      id: `tavern-opening:${story.chapterId}:${story.roomConfig.id}`,
      role: "narrator",
      body: createTavernAgentOutputFieldMessageBody({
        field: "narrative",
        text: `已进入「${story.context.target?.label || story.chapterId}」的酒馆演绎。`,
      }),
      createdAt: openingMessageCreatedAt,
      status: "done",
      presentation: {
        profileId: openingProfile.id,
        userInputMode: openingProfile.userInputMode,
      },
    };
    const renderInputs: MessageRenderInput[] = [
      openingMessage,
      ...messages.map((message) => {
        const profile = getTavernPresentationProfile(message.presentationProfileId);
        const baseMessage = {
          id: message.id,
          body: message.body,
          createdAt: message.createdAt,
          status: message.status,
          presentation: {
            profileId: profile.id,
            userInputMode: profile.userInputMode,
          },
        };

        if (message.role === "character") {
          return {
            ...baseMessage,
            role: message.role,
            characterId: message.characterId!,
          };
        }

        return {
          ...baseMessage,
          role: message.role,
        };
      }),
    ];

    return Message.normalize({
      messages: renderInputs,
      characterProfiles,
      userName: "我",
    });
  }, [messages, openingMessageCreatedAt, story]);
  const latestMessage = renderableRoomMessages[renderableRoomMessages.length - 1] ?? null;
  const presentationProfile = getTavernPresentationProfile(story?.roomConfig.presentation.profileId);
  const conversationRenderer = Message.resolveRenderer(presentationProfile.renderStyle);
  const Conversation = conversationRenderer.Conversation;
  const executionTraceStatusText = busy.kind === "sending" ? busy.status : "";
  const isSending = isTavernRoomSending(busy);
  const shouldShowExecutionTrace = executionSteps.length > 0;
  const hasExecutionTraceAnchor =
    shouldShowExecutionTrace && renderableRoomMessages.some((message) => message.id === executionTraceAnchorMessageId);
  const scrollMessagesToBottom = useCallback(() => {
    const viewport = messageViewportRef.current;
    if (!viewport) {
      messageEndRef.current?.scrollIntoView({ block: "end" });
      return;
    }

    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: "auto",
    });
  }, []);

  useLayoutEffect(() => {
    scrollMessagesToBottom();

    const firstFrame = window.requestAnimationFrame(() => {
      scrollMessagesToBottom();
      window.requestAnimationFrame(scrollMessagesToBottom);
    });

    return () => window.cancelAnimationFrame(firstFrame);
  }, [
    story?.chapterId,
    latestMessage?.content,
    latestMessage?.id,
    renderableRoomMessages.length,
    scrollMessagesToBottom,
    executionSteps.length,
    executionTraceStatusText,
    isOpen,
  ]);

  useEffect(() => {
    const messageList = messageListRef.current;
    if (!messageList || typeof ResizeObserver === "undefined") {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      scrollMessagesToBottom();
    });
    resizeObserver.observe(messageList);

    return () => resizeObserver.disconnect();
  }, [story?.chapterId, scrollMessagesToBottom, isOpen]);

  if (!story) {
    return null;
  }

  const backgroundStyle = {
    backgroundImage: `${visualPreset.tavern.backgroundOverlay}, url(${visualPreset.tavern.backgroundImage})`,
    backgroundPosition: visualPreset.tavern.backgroundPosition,
    backgroundRepeat: "no-repeat",
    backgroundSize: visualPreset.tavern.backgroundSize,
  } satisfies CSSProperties;
  const chapterContextContent = {
    themeLabel: visualPreset.label,
    title: story.roomConfig.title,
    chapterLabel: story.context.target?.label || story.chapterId,
    sections: story.context.sections.slice(0, 4).map((section) => ({
      id: section.id,
      label: section.label,
      content: section.content,
    })),
    footerNote: `上下文版本 ${story.context.revision} · ${story.context.sources.length} 个来源`,
  };

  return (
    <>
      <ScrollArea
        viewportRef={messageViewportRef}
        className={cn("min-h-0 flex-1", visualPreset.tavern.scrollArea)}
        style={backgroundStyle}
      >
        <div
          ref={messageListRef}
          className={cn("mx-auto flex w-full flex-col gap-4 px-4 py-6 sm:px-5", visualPreset.tavern.messageList)}
        >
          <ChapterContextCard
            className={cn("w-full self-center", isSidePanelOpen ? "max-w-[44rem]" : "max-w-[46rem]")}
            visualPreset={visualPreset}
            content={chapterContextContent}
          />
          <Conversation
            messages={renderableRoomMessages}
            immersiveDescriptionEnabled={story.roomConfig.settings.immersiveDescriptionEnabled}
            isSending={isSending}
            visualStyle={visualPreset.tavern}
            shouldShowExecutionTrace={shouldShowExecutionTrace}
            executionTraceAnchorMessageId={executionTraceAnchorMessageId}
            hasExecutionTraceAnchor={hasExecutionTraceAnchor}
            isSidePanelOpen={isSidePanelOpen}
            renderExecutionTrace={() => <ExecutionTrace steps={executionSteps} statusText={executionTraceStatusText} />}
            messageEndRef={messageEndRef}
          />
        </div>
      </ScrollArea>

      <Composer />
    </>
  );
};
