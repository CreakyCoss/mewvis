import type { CSSProperties } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { listWorkspaceFiles, type WorkspaceFileEntry } from "@/features/pages/workspace/files-api";
import { cn } from "@/lib/utils";
import { getTavernPresentationProfile } from "@/features/pages/taverns/tavern/prompt-registry/presentation-rules";
import { getTavernSceneInstanceDisplayTitle } from "@/features/pages/taverns/tavern/runtime/scene-selectors";
import { Composer } from "../composer";
import { useTavernRoomContext } from "../context";
import { ExecutionTrace } from "../execution-trace";
import { createTavernRenderableMessages } from "../message/domain/render-model";
import { resolveTavernConversationRenderer } from "../message/renderers";
import { selectTavernRuntimeActiveSceneFields, selectTavernRuntimeActiveSceneInstanceId } from "../runtime/accessors";
import { SceneBriefCard } from "../scene-brief-card";
import { SceneSelector } from "../scene-selector";

type TavernRoomContentProps = {
  isOpen: boolean;
  isSidePanelOpen: boolean;
};

const getTavernSceneText = (value: string, fallback: string) => value.trim() || fallback;

export const TavernRoomContent = ({ isOpen, isSidePanelOpen }: TavernRoomContentProps) => {
  const workspace = useTavernRoomContext((store) => store.workspace);
  const activeRoom = useTavernRoomContext((store) => store.activeRoom);
  const visualPreset = useTavernRoomContext((store) => store.visualPreset);
  const roomCharacters = useTavernRoomContext((store) => store.roomCharacters);
  const roomMessages = useTavernRoomContext((store) => store.roomMessages);
  const busy = useTavernRoomContext((store) => store.busy);
  const selectRoomSceneInstance = useTavernRoomContext((store) => store.selectRoomSceneInstance);
  const executionSteps = useTavernRoomContext((store) => store.executionSteps);
  const executionTraceAnchorMessageId = useTavernRoomContext((store) => store.executionTraceAnchorMessageId);
  const [files, setFiles] = useState<WorkspaceFileEntry[]>([]);
  const messageViewportRef = useRef<HTMLDivElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!workspace.path) {
      setFiles([]);
      return;
    }

    let isCancelled = false;

    void listWorkspaceFiles(workspace.path)
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
  }, [workspace.path]);

  const renderableRoomMessages = useMemo(
    () =>
      activeRoom
        ? createTavernRenderableMessages({
            messages: roomMessages,
            characters: roomCharacters,
            userPersonaName: activeRoom.user.personaName,
          })
        : [],
    [activeRoom, roomCharacters, roomMessages],
  );
  const latestMessage = renderableRoomMessages[renderableRoomMessages.length - 1] ?? null;
  const presentationProfile = getTavernPresentationProfile(activeRoom?.presentation.profile?.profileId);
  const conversationRenderer = resolveTavernConversationRenderer(presentationProfile.renderStyle);
  const Conversation = conversationRenderer.Conversation;
  const executionTraceStatusText = busy.kind === "sending" ? busy.status : "";
  const shouldShowExecutionTrace = executionSteps.length > 0;
  const hasExecutionTraceAnchor =
    shouldShowExecutionTrace && renderableRoomMessages.some((message) => message.id === executionTraceAnchorMessageId);
  const handleSelectSceneInstance = useCallback(
    (sceneInstanceId: string) => {
      if (!activeRoom) {
        return;
      }

      selectRoomSceneInstance(activeRoom.identity.id, sceneInstanceId);
      useTavernRoomContext.getState().composerHandle?.clearReplyOptions();
    },
    [activeRoom, selectRoomSceneInstance],
  );

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
    activeRoom ? selectTavernRuntimeActiveSceneInstanceId(activeRoom) : "",
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
  }, [
    activeRoom?.identity.id,
    activeRoom ? selectTavernRuntimeActiveSceneInstanceId(activeRoom) : "",
    scrollMessagesToBottom,
    isOpen,
  ]);

  if (!activeRoom) {
    return null;
  }

  const backgroundStyle = {
    backgroundImage: `${visualPreset.tavern.backgroundOverlay}, url(${visualPreset.tavern.backgroundImage})`,
    backgroundPosition: visualPreset.tavern.backgroundPosition,
    backgroundRepeat: "no-repeat",
    backgroundSize: visualPreset.tavern.backgroundSize,
  } satisfies CSSProperties;
  const activeSceneFields = selectTavernRuntimeActiveSceneFields(activeRoom);
  const activeSceneInstanceId = selectTavernRuntimeActiveSceneInstanceId(activeRoom);
  const activeSceneTitle = getTavernSceneInstanceDisplayTitle(activeRoom, activeSceneInstanceId);
  const sceneInstanceOptions = activeRoom.scenes.instances.map((instance) => ({
    id: instance.id,
    label: getTavernSceneInstanceDisplayTitle(activeRoom, instance.id),
  }));
  const sceneDescription = getTavernSceneText(activeSceneFields.scene, "这个房间还没有场景描述。");
  const sceneMechanism = getTavernSceneText(
    activeSceneFields.scenePlot,
    getTavernSceneText(activeRoom.story.outline, "剧情会根据角色行动与明确事件推进。"),
  );
  const sceneGoal = getTavernSceneText(
    activeSceneFields.sceneGoal,
    getTavernSceneText(activeRoom.story.goal, "完成当前场景目标。"),
  );
  const sceneEnding = getTavernSceneText(activeSceneFields.sceneTransition, "达成目标或触发关键条件时结算。");
  const sceneBriefLines = Array.from(
    new Set(
      [
        activeRoom.story.outline.trim() || sceneDescription,
        activeRoom.story.goal.trim() || activeSceneFields.sceneGoal.trim(),
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
    footerNote: activeSceneFields.sceneDirection.trim(),
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
            sceneSelector={
              <SceneSelector
                options={sceneInstanceOptions}
                activeValue={activeSceneInstanceId}
                label="节点："
                onSelectScene={handleSelectSceneInstance}
              />
            }
          />
          <Conversation
            messages={renderableRoomMessages}
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
