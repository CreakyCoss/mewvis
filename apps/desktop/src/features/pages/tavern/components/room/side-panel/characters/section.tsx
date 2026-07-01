import { useEffect, useState } from "react";
import { Save, TriangleAlertIcon, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  requireRuntimeModelInput,
  type RuntimeModelOption,
} from "@/features/pages/settings/llm/store";
import {
  isTavernProgressVisibilityVisibleToUser,
  tavernCharacterAgentRoleId,
} from "../../../../core";
import {
  updateTavernActiveCharacterMemoryLayers,
} from "../../../../runtime/active-scene-runtime";
import { runTavernAssetExtraction } from "../../../../runtime/assistants";
import {
  compactTavernAgentKnowledge,
  rebuildTavernAgentKnowledge,
} from "../../../../runtime/conversation";
import { useTavernPageContext } from "../../../context";
import { buildTavernCharacterMemoryText } from "../memory-summary";
import { EmptyPanelCard } from "../shared";
import {
  createFallbackStatusItem,
  createResolvedStatusMetric,
  getProgressStatusItems,
} from "../status-utils";
import { CharacterStatusRow } from ".";

const TAVERN_RUNTIME_MODEL_UNAVAILABLE = "当前模型配置已不可用，请重新选择模型。";

type CharacterMemoryDraftMode = "manual" | "generated";

type CharacterConfirmAction = {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
};

const requireTavernRuntimeModelInput = (runtimeModel: RuntimeModelOption) =>
  requireRuntimeModelInput(runtimeModel, TAVERN_RUNTIME_MODEL_UNAVAILABLE);

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "未知错误";
};

export const CharacterStatusSection = ({
  externalBusy,
  onBusyChange,
}: {
  externalBusy: boolean;
  onBusyChange?: (isBusy: boolean) => void;
}) => {
  const {
    activeRoom,
    activeCharacter,
    roomCharacters,
    roomMessages,
    runtimeModel,
    isSending,
    patchRoom,
    reportError,
    resetExecutionTrace,
    patchExecutionStep,
    setExecutionTraceAnchorMessageId,
    workspace,
  } = useTavernPageContext();
  const [compactingCharacterIds, setCompactingCharacterIds] = useState<Set<string>>(() => new Set());
  const [rebuildingCharacterIds, setRebuildingCharacterIds] = useState<Set<string>>(() => new Set());
  const [extractingCharacterMemoryIds, setExtractingCharacterMemoryIds] = useState<Set<string>>(() => new Set());
  const [memoryDraftCharacterId, setMemoryDraftCharacterId] = useState<string | null>(null);
  const [memoryDraftText, setMemoryDraftText] = useState("");
  const [memoryDraftMode, setMemoryDraftMode] = useState<CharacterMemoryDraftMode>("manual");
  const [pendingConfirmAction, setPendingConfirmAction] = useState<CharacterConfirmAction | null>(null);
  const isCharacterBusy =
    compactingCharacterIds.size > 0 ||
    rebuildingCharacterIds.size > 0 ||
    extractingCharacterMemoryIds.size > 0;
  const isBusy = externalBusy || isCharacterBusy;
  const memoryDraftCharacter = memoryDraftCharacterId
    ? roomCharacters.find((character) => character.id === memoryDraftCharacterId)
    : undefined;

  useEffect(() => {
    onBusyChange?.(isCharacterBusy);
  }, [isCharacterBusy, onBusyChange]);

  useEffect(() => () => {
    onBusyChange?.(false);
  }, [onBusyChange]);

  if (!activeRoom) {
    return null;
  }

  const statusDefinitionById = new Map(activeRoom.statusDefinitions.map((definition) => [definition.id, definition]));
  const visibleStatusDefinitions = activeRoom.statusDefinitions.filter((definition) =>
    isTavernProgressVisibilityVisibleToUser(definition.visibility)
  );
  const configuredCharacterStatusItems = getProgressStatusItems(activeRoom.progressViews, "characterCard")
    .filter((item) => {
      const definition = statusDefinitionById.get(item.statusId);
      return definition?.scope === "character" &&
        isTavernProgressVisibilityVisibleToUser(definition.visibility);
    });
  const fallbackCharacterStatusItems = visibleStatusDefinitions
    .filter((definition) => definition.scope === "character")
    .map((definition) => createFallbackStatusItem(definition.id));
  const characterStatusItems = configuredCharacterStatusItems.length > 0
    ? configuredCharacterStatusItems
    : fallbackCharacterStatusItems;
  const metricsByCharacterId = new Map(roomCharacters.map((character) => {
    const metrics = characterStatusItems
      .flatMap((item) => {
        const definition = statusDefinitionById.get(item.statusId);
        if (!definition || definition.scope !== "character") {
          return [];
        }
        const metric = createResolvedStatusMetric({
          activeRoom,
          definition,
          item,
          ownerCharacter: character,
        });
        return metric ? [metric] : [];
      });
    return [character.id, metrics] as const;
  }));

  const openMemoryDraftDialog = (
    characterId: string,
    note = "",
    mode: CharacterMemoryDraftMode = "manual",
  ) => {
    setMemoryDraftCharacterId(characterId);
    setMemoryDraftText(note);
    setMemoryDraftMode(mode);
  };
  const closeMemoryDraftDialog = () => {
    setMemoryDraftCharacterId(null);
    setMemoryDraftText("");
    setMemoryDraftMode("manual");
  };
  const closeConfirmAction = () => {
    setPendingConfirmAction(null);
  };
  const confirmPendingAction = () => {
    if (!pendingConfirmAction) {
      return;
    }

    pendingConfirmAction.onConfirm();
    closeConfirmAction();
  };
  const appendCharacterMemory = (characterId: string, note: string) => {
    const nextNote = note.trim();
    if (!nextNote) {
      reportError("请输入要添加的角色记忆。");
      return;
    }

    const character = roomCharacters.find((item) => item.id === characterId);
    if (!character) {
      reportError("未找到要添加记忆的角色。");
      return;
    }

    const activeInstance = activeRoom.sceneInstances.find((instance) =>
      instance.id === activeRoom.activeSceneInstanceId
    );
    const existing = activeInstance?.characterMemoryLayers?.[characterId]?.known.trim() ?? "";
    const nextKnownMemory = existing
      ? [existing, nextNote].join("\n")
      : nextNote;
    const nextRoom = updateTavernActiveCharacterMemoryLayers(activeRoom, characterId, {
      known: nextKnownMemory,
    });

    patchRoom(activeRoom.id, nextRoom);
    closeMemoryDraftDialog();
    toast.success(`已添加 ${character.name} 的角色记忆。`);
  };
  const extractCharacterMemoryFromRecentPlot = async (characterId: string) => {
    if (isBusy) {
      return;
    }

    const character = roomCharacters.find((item) => item.id === characterId);
    if (!character) {
      reportError("未找到要整理记忆的角色。");
      return;
    }

    if (!runtimeModel) {
      reportError("请先在设置中选择模型，再整理角色记忆。");
      return;
    }

    const availableMessages = roomMessages.filter((message) =>
      message.status !== "streaming" && message.status !== "error"
    );
    const contextMessages = availableMessages.slice(-30);
    const sourceMessages = availableMessages.slice(-12);
    if (sourceMessages.length === 0) {
      reportError("当前房间还没有可整理的对话。");
      return;
    }

    setExtractingCharacterMemoryIds((current) => new Set([...current, characterId]));
    reportError("");
    if (activeRoom.settings.showExecutionTrace) {
      setExecutionTraceAnchorMessageId(sourceMessages.at(-1)?.id ?? "");
      resetExecutionTrace([{
        id: `character-memory-extraction-${characterId}`,
        label: `整理 ${character.name} 的记忆`,
        detail: "从最近对话中提取该角色需要长期记住的事实。",
        status: "running",
      }]);
    }

    try {
      const extractedDraft = await runTavernAssetExtraction({
        workspacePath: workspace.path,
        runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
        room: activeRoom,
        characters: roomCharacters,
        messages: contextMessages,
        sourceMessages,
        references: [],
        currentUserText: `只整理「${character.name}」需要长期记住的稳定事实，输出 characterMemories 时只使用 characterId="${character.id}"。`,
      });
      const characterMemoryDrafts = extractedDraft.characterMemories.filter((memory) =>
        memory.characterId === character.id && memory.note.trim()
      );
      const generatedMemory = characterMemoryDrafts
        .map((memory) => memory.note.trim())
        .filter(Boolean)
        .join("\n");
      if (!generatedMemory) {
        patchExecutionStep(`character-memory-extraction-${characterId}`, {
          status: "done",
          detail: "没有发现该角色新的稳定记忆。",
        });
        toast.info(`最近剧情没有整理出 ${character.name} 的新记忆。`);
        return;
      }

      openMemoryDraftDialog(character.id, generatedMemory, "generated");
      patchExecutionStep(`character-memory-extraction-${characterId}`, {
        status: "done",
        detail: "已生成待确认角色记忆。",
      });
      toast.success(`已整理 ${character.name} 的角色记忆，请确认后添加。`);
    } catch (assetError) {
      patchExecutionStep(`character-memory-extraction-${characterId}`, {
        status: "error",
        detail: getErrorMessage(assetError),
      });
      reportError(`整理角色记忆失败：${getErrorMessage(assetError)}`);
    } finally {
      setExtractingCharacterMemoryIds((current) => {
        const next = new Set(current);
        next.delete(characterId);
        return next;
      });
    }
  };
  const compactCharacterKnowledge = async (characterId: string) => {
    const character = roomCharacters.find((item) => item.id === characterId);
    if (!character) {
      reportError("未找到要压缩知识的角色。");
      return;
    }

    if (!runtimeModel) {
      reportError("请先在设置中选择模型，再压缩角色知识。");
      return;
    }

    setCompactingCharacterIds((current) => new Set([...current, characterId]));
    reportError("");
    try {
      const result = await compactTavernAgentKnowledge({
        workspacePath: workspace.path,
        room: activeRoom,
        runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
        agentRoleId: tavernCharacterAgentRoleId(activeRoom, character),
        compactInstruction: [
          `压缩「${character.name}」在当前酒馆中的长期角色知识。`,
          "保留角色已经知道的公开事实、自己产生过的心理与承诺、与其他角色的关系变化。",
          "不要引入其他角色未公开的心理描写。",
        ].join("\n"),
      });
      toast.success(result?.compacted === false
        ? `${character.name} 的底层 session 暂无可压缩内容。`
        : `已压缩 ${character.name} 的角色知识。`);
    } catch (compactError) {
      reportError(`压缩角色知识失败：${getErrorMessage(compactError)}`);
    } finally {
      setCompactingCharacterIds((current) => {
        const next = new Set(current);
        next.delete(characterId);
        return next;
      });
    }
  };
  const rebuildCharacterKnowledge = async (characterId: string) => {
    const character = roomCharacters.find((item) => item.id === characterId);
    if (!character) {
      reportError("未找到要重建记忆的角色。");
      return;
    }

    if (!runtimeModel) {
      reportError("请先在设置中选择模型，再重建角色记忆。");
      return;
    }

    setRebuildingCharacterIds((current) => new Set([...current, characterId]));
    reportError("");
    try {
      await rebuildTavernAgentKnowledge({
        workspacePath: workspace.path,
        room: activeRoom,
        runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
        agentRoleId: tavernCharacterAgentRoleId(activeRoom, character),
        rebuildInstruction: [
          `重建「${character.name}」在当前酒馆中的长期角色记忆。`,
          "基于酒馆历史、可见事实、角色设定、角色记忆和关系变化恢复该角色应当知道的上下文。",
          "保留角色已经知道的公开事实、自己产生过的心理与承诺、与其他角色的关系变化。",
          "不要引入其他角色未公开给该角色的心理描写或秘密。",
        ].join("\n"),
        userMessage: `请重建「${character.name}」的长期角色记忆。`,
      });
      toast.success(`已重建 ${character.name} 的角色记忆。`);
    } catch (rebuildError) {
      reportError(`重建角色记忆失败：${getErrorMessage(rebuildError)}`);
    } finally {
      setRebuildingCharacterIds((current) => {
        const next = new Set(current);
        next.delete(characterId);
        return next;
      });
    }
  };
  const requestCompactCharacterKnowledge = (characterId: string) => {
    const character = roomCharacters.find((item) => item.id === characterId);
    if (!character) {
      reportError("未找到要压缩知识的角色。");
      return;
    }

    setPendingConfirmAction({
      title: "压缩角色知识",
      description: `压缩「${character.name}」的底层角色知识？这会精简该角色 Agent 的上下文，保留长期事实、承诺和关系变化。`,
      confirmLabel: "确认压缩",
      onConfirm: () => void compactCharacterKnowledge(characterId),
    });
  };
  const requestRebuildCharacterKnowledge = (characterId: string) => {
    const character = roomCharacters.find((item) => item.id === characterId);
    if (!character) {
      reportError("未找到要重建记忆的角色。");
      return;
    }

    setPendingConfirmAction({
      title: "重建角色记忆",
      description: `重建「${character.name}」的底层角色记忆？这会基于酒馆历史重新恢复该角色应当知道的上下文，不会删除当前酒馆中保存的角色记忆文本。`,
      confirmLabel: "确认重建",
      onConfirm: () => void rebuildCharacterKnowledge(characterId),
    });
  };

  return (
    <section className="space-y-3">
      <div className="flex min-h-8 items-center gap-2 text-sm font-semibold leading-tight text-current">
        <UsersRound className="size-4 shrink-0 text-primary" />
        <span className="truncate">入席角色</span>
      </div>
      <div className="space-y-2">
        {roomCharacters.map((character) => {
          const isCompacting = compactingCharacterIds.has(character.id);
          const isRebuilding = rebuildingCharacterIds.has(character.id);
          const isExtractingMemory = extractingCharacterMemoryIds.has(character.id);
          const characterMemory = buildTavernCharacterMemoryText(activeRoom, character);
          return (
            <CharacterStatusRow
              key={character.id}
              character={character}
              room={activeRoom}
              isActive={character.id === activeCharacter?.id}
              disabled={isSending}
              memory={characterMemory}
              metrics={metricsByCharacterId.get(character.id) ?? []}
              isBusy={isBusy}
              isCompacting={isCompacting}
              isRebuilding={isRebuilding}
              isExtractingMemory={isExtractingMemory}
              onClick={() => patchRoom(activeRoom.id, { activeCharacterId: character.id })}
              onAddMemory={() => openMemoryDraftDialog(character.id)}
              onExtractMemory={() => void extractCharacterMemoryFromRecentPlot(character.id)}
              onCompact={() => requestCompactCharacterKnowledge(character.id)}
              onRebuild={() => requestRebuildCharacterKnowledge(character.id)}
            />
          );
        })}
        {roomCharacters.length === 0 && (
          <EmptyPanelCard>还没有角色入席。</EmptyPanelCard>
        )}
      </div>

      <Dialog
        open={Boolean(memoryDraftCharacter)}
        onOpenChange={(open) => {
          if (!open) {
            closeMemoryDraftDialog();
          }
        }}
      >
        {memoryDraftCharacter && (
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {memoryDraftMode === "generated" ? "确认角色记忆" : "添加角色记忆"}
              </DialogTitle>
              <DialogDescription>
                {memoryDraftMode === "generated"
                  ? `模型已从最近剧情中整理出「${memoryDraftCharacter.name}」的长期记忆，确认后会追加到当前酒馆角色记忆。`
                  : `追加到「${memoryDraftCharacter.name}」在当前酒馆中的长期角色记忆。`}
              </DialogDescription>
            </DialogHeader>

            <Textarea
              value={memoryDraftText}
              className="min-h-32 resize-none"
              placeholder={memoryDraftMode === "generated"
                ? "确认或修改模型整理的角色记忆。"
                : "写下这个角色需要长期记住的事实、承诺、关系变化或已知信息。"}
              onChange={(event) => setMemoryDraftText(event.target.value)}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={closeMemoryDraftDialog}
              >
                取消
              </Button>
              <Button
                type="button"
                disabled={!memoryDraftText.trim()}
                onClick={() => appendCharacterMemory(memoryDraftCharacter.id, memoryDraftText)}
              >
                <Save className="size-3.5" />
                {memoryDraftMode === "generated" ? "确认添加" : "添加"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <Dialog
        open={Boolean(pendingConfirmAction)}
        onOpenChange={(open) => {
          if (!open) {
            closeConfirmAction();
          }
        }}
      >
        {pendingConfirmAction && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
                  <TriangleAlertIcon className="size-4" />
                </span>
                <DialogTitle>{pendingConfirmAction.title}</DialogTitle>
              </div>
              <DialogDescription>{pendingConfirmAction.description}</DialogDescription>
            </DialogHeader>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={closeConfirmAction}
              >
                取消
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={confirmPendingAction}
              >
                {pendingConfirmAction.confirmLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </section>
  );
};
