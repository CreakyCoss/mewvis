import type { CSSProperties } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { listWorkspaceFiles, type WorkspaceFileEntry } from "@/features/pages/workspace/files-api";
import { cn } from "@/lib/utils";
import { getTavernPresentationProfile } from "@/features/pages/taverns/tavern/prompt-registry/presentation-rules";
import { getTavernRoomSceneTitle } from "@/features/pages/taverns/room/model";
import { Composer } from "../composer";
import { isTavernRoomSending, useTavernRoomContext } from "../context";
import { ExecutionTrace } from "../execution-trace";
import { Message } from "../message";
import type { MessageCharacterProfile, MessageRenderInput } from "../message/types";
import { SceneBriefCard } from "../scene-brief-card";

type TavernRoomContentProps = {
  isOpen: boolean;
  isSidePanelOpen: boolean;
};

export const TavernRoomContent = ({ isOpen, isSidePanelOpen }: TavernRoomContentProps) => {
  const workspace = useTavernRoomContext((store) => store.workspace);
  const tavernWorkspacePath = useTavernRoomContext((store) => store.tavernWorkspacePath);
  const activeRoom = useTavernRoomContext((store) => store.activeRoom);
  const visualPreset = useTavernRoomContext((store) => store.visualPreset);
  const roomCharacters = useTavernRoomContext((store) => store.roomCharacters);
  const roomMessages = useTavernRoomContext((store) => store.roomMessages);
  const busy = useTavernRoomContext((store) => store.busy);
  const executionSteps = useTavernRoomContext((store) => store.executionSteps);
  const executionTraceAnchorMessageId = useTavernRoomContext((store) => store.executionTraceAnchorMessageId);
  const [files, setFiles] = useState<WorkspaceFileEntry[]>([]);
  const messageViewportRef = useRef<HTMLDivElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const workspacePath = tavernWorkspacePath.trim() || workspace.path.trim();
    if (!workspacePath) {
      setFiles([]);
      return;
    }

    let isCancelled = false;

    void listWorkspaceFiles(workspacePath)
      .then((nextFiles) => {
        if (!isCancelled) {
          setFiles(nextFiles);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setFiles([]);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [tavernWorkspacePath, workspace.path]);

  const renderableRoomMessages = useMemo(
    () => {
      if (!activeRoom) {
        return [];
      }

      const characterProfiles: MessageCharacterProfile[] = roomCharacters.map((character) => ({
        id: character.id,
        name: character.name,
        avatar: character.avatar,
      }));
      const messages: MessageRenderInput[] = roomMessages.map((message) => {
        const profile = getTavernPresentationProfile(message.presentationProfileId);
        const baseMessage = {
          id: message.id,
          body: message.body,
          createdAt: message.createdAt,
          status: message.status,
          referencedFiles: message.referencedFiles,
          presentation: {
            profileId: profile.id,
            userInputMode: profile.userInputMode,
          },
        };

        if (message.role === "character") {
          return {
            ...baseMessage,
            role: message.role,
            characterId: message.characterId ?? "",
          };
        }

        return {
          ...baseMessage,
          role: message.role,
        };
      });

      return Message.normalize({
        messages,
        characterProfiles,
        userName: activeRoom.user.personaName,
      });
    },
    [activeRoom, roomCharacters, roomMessages],
  );
  const latestMessage = renderableRoomMessages[renderableRoomMessages.length - 1] ?? null;
  const presentationProfile = getTavernPresentationProfile(activeRoom?.presentation.profile?.profileId);
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
    activeRoom?.identity.id,
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
  }, [activeRoom?.identity.id, scrollMessagesToBottom, isOpen]);

  if (!activeRoom) {
    return null;
  }

  const backgroundStyle = {
    backgroundImage: `${visualPreset.tavern.backgroundOverlay}, url(${visualPreset.tavern.backgroundImage})`,
    backgroundPosition: visualPreset.tavern.backgroundPosition,
    backgroundRepeat: "no-repeat",
    backgroundSize: visualPreset.tavern.backgroundSize,
  } satisfies CSSProperties;
  const scene = activeRoom.scene;
  const activeSceneTitle = getTavernRoomSceneTitle(activeRoom, "");
  const sceneDescription = scene.scene?.trim() ?? "";
  const sceneMechanism = scene.plot?.trim() || activeRoom.story.outline.trim();
  const sceneGoal = scene.sceneGoal?.trim() || activeRoom.story.goal.trim();
  const sceneEnding = scene.transition?.trim() ?? "";
  const sceneBriefLines = Array.from(
    new Set(
      [
        activeRoom.story.outline.trim() || sceneDescription,
        activeRoom.story.goal.trim() || scene.sceneGoal.trim(),
      ].filter(Boolean),
    ),
  );
  const sceneBriefContent = {
    themeLabel: visualPreset.label,
    title: activeRoom.identity.title,
    sceneTitle: activeSceneTitle,
    briefLines: sceneBriefLines,
    description: sceneDescription,
    mechanism: sceneMechanism,
    goal: sceneGoal,
    ending: sceneEnding,
    footerNote: scene.storyDirection.trim(),
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
          <SceneBriefCard
            className={cn("w-full self-center", isSidePanelOpen ? "max-w-[44rem]" : "max-w-[46rem]")}
            visualPreset={visualPreset}
            content={sceneBriefContent}
          />
          <Conversation
            messages={renderableRoomMessages}
            immersiveDescriptionEnabled={activeRoom.presentation.settings.immersiveDescriptionEnabled}
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

      <Composer files={files} />
    </>
  );
};
