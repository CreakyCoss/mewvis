import { useState } from "react";
import { Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  addTavernSecretMemoryEntry,
  revealTavernSecretMemory,
} from "../../../../../runtime/branch-memory-runtime";
import {
  projectTavernSceneOntoRoom,
  updateTavernActiveCharacterMemoryLayers,
  updateTavernActiveSceneMemoryLayers,
} from "../../../../../runtime/active-scene-runtime";
import {
  createTavernLorebookEntry,
} from "../../../../../factories/asset-factories";
import type {
  TavernAssetDraft,
  TavernCharacter,
} from "../../../../../types";
import { useTavernPageContext } from "@/features/pages/taverns/components/context";
import {
  ConfirmActionDialog,
  EmptyDetailState,
  PlotDataSheet,
  emptyValueText,
  type ConfirmAction,
  type PlotDataDialogProps,
} from "./shared";

const AssetDraftPreview = ({
  draft,
  index,
  roomCharacters,
  isBusy,
  onApply,
  onDelete,
}: {
  draft: TavernAssetDraft;
  index: number;
  roomCharacters: TavernCharacter[];
  isBusy: boolean;
  onApply: () => void;
  onDelete: () => void;
}) => {
  const characterById = new Map(roomCharacters.map((character) => [character.id, character]));
  const memoryVisibilityLabel = {
    public: "公开",
    hidden: "隐藏",
    character: "指定角色可见",
  } as const;
  const sceneMemoryVisibilityLabel = {
    public: "公开",
    hidden: "隐藏",
    director: "导演",
  } as const;
  const draftSummary = [
    draft.sceneMemories.length > 0 ? `${draft.sceneMemories.length} 场景记忆` : "",
    draft.characterMemories.length > 0 ? `${draft.characterMemories.length} 记忆` : "",
    draft.lorebookEntries.length > 0 ? `${draft.lorebookEntries.length} 世界书` : "",
  ].filter(Boolean).join(" / ");

  return (
    <div className="space-y-3 rounded-md border border-current/10 bg-current/5 p-3 text-current">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold">草稿 {index + 1}</div>
          {draftSummary && (
            <div className="mt-0.5 text-xs opacity-65">{draftSummary}</div>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            size="xs"
            disabled={isBusy}
            onClick={onApply}
          >
            <Save className="size-3.5" />
            应用
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7"
            title="忽略草稿"
            aria-label="忽略草稿"
            disabled={isBusy}
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {draft.sceneMemories.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-medium opacity-70">场景记忆</div>
          {draft.sceneMemories.map((memory) => (
            <div key={memory.id} className="rounded-md bg-current/5 px-2.5 py-2">
              <div className="text-[11px] opacity-55">
                {sceneMemoryVisibilityLabel[memory.visibility]}
              </div>
              <div className="mt-1 whitespace-pre-wrap text-xs leading-5 opacity-70">
                {memory.note || emptyValueText}
              </div>
            </div>
          ))}
        </div>
      )}

      {draft.characterMemories.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-medium opacity-70">角色记忆</div>
          {draft.characterMemories.map((memory) => (
            <div key={memory.id} className="rounded-md bg-current/5 px-2.5 py-2">
              <div className="text-xs font-medium">
                {characterById.get(memory.characterId)?.name ?? "角色"}
              </div>
              <div className="mt-0.5 text-[11px] opacity-55">
                {memoryVisibilityLabel[memory.visibility]}
                {memory.visibility === "character" && memory.revealToCharacterIds.length
                  ? `：${memory.revealToCharacterIds
                      .map((characterId) => characterById.get(characterId)?.name ?? characterId)
                      .join("、")}`
                  : ""}
              </div>
              <div className="mt-1 whitespace-pre-wrap text-xs leading-5 opacity-70">
                {memory.note || emptyValueText}
              </div>
            </div>
          ))}
        </div>
      )}

      {draft.lorebookEntries.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-medium opacity-70">世界书</div>
          {draft.lorebookEntries.map((entry) => (
            <div key={entry.id} className="rounded-md bg-current/5 px-2.5 py-2">
              <div className="text-xs font-medium">{entry.title || emptyValueText}</div>
              {entry.keywords.length > 0 && (
                <div className="mt-1 text-[11px] opacity-60">
                  {entry.keywords.join("，")}
                </div>
              )}
              <div className="mt-1 whitespace-pre-wrap text-xs leading-5 opacity-70">
                {entry.content || emptyValueText}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const AssetDraftsDialog = ({ bind, isBusy }: PlotDataDialogProps) => {
  const { activeRoom, roomCharacters, patchRoom } = useTavernPageContext();
  const [pendingConfirmAction, setPendingConfirmAction] = useState<ConfirmAction | null>(null);

  const applyAssetDraft = (draftId: string) => {
    if (!activeRoom) {
      return;
    }
    const draft = activeRoom.assetDrafts.find((item) => item.id === draftId);
    if (!draft) {
      return;
    }

    const memoryDrafts = draft.characterMemories.filter((memory) =>
      memory.characterId.trim() && memory.note.trim()
    );
    const sceneMemoryDrafts = draft.sceneMemories.filter((memory) => memory.note.trim());
    const lorebookEntries = draft.lorebookEntries.filter((entry) =>
      entry.title.trim() && entry.content.trim()
    );
    let nextRoom = projectTavernSceneOntoRoom(activeRoom);
    for (const memory of sceneMemoryDrafts) {
      const nextNote = memory.note.trim();
      if (memory.visibility === "hidden") {
        const addResult = addTavernSecretMemoryEntry(nextRoom, {
          target: { type: "scene" },
          text: nextNote,
          secretId: memory.secretId,
        });
        nextRoom = addResult.room;
        continue;
      }

      const activeInstance = nextRoom.sceneInstances.find((instance) =>
        instance.id === nextRoom.activeSceneInstanceId
      );
      const layers = activeInstance?.memoryLayers;
      if (memory.visibility === "director") {
        nextRoom = updateTavernActiveSceneMemoryLayers(nextRoom, {
          directorSecret: [
            layers?.directorSecret?.trim() ?? "",
            nextNote,
          ].filter(Boolean).join("\n"),
        });
      } else {
        nextRoom = updateTavernActiveSceneMemoryLayers(nextRoom, {
          public: [
            layers?.public?.trim() ?? "",
            nextNote,
          ].filter(Boolean).join("\n"),
        });
      }
    }
    for (const memory of memoryDrafts) {
      const nextNote = memory.note.trim();
      if (memory.visibility === "public") {
        const activeInstance = nextRoom.sceneInstances.find((instance) =>
          instance.id === nextRoom.activeSceneInstanceId
        );
        const existing = activeInstance?.characterMemoryLayers?.[memory.characterId]?.public.trim() ?? "";
        nextRoom = updateTavernActiveCharacterMemoryLayers(nextRoom, memory.characterId, {
          public: [existing, nextNote].filter(Boolean).join("\n"),
        });
        continue;
      }

      const addResult = addTavernSecretMemoryEntry(nextRoom, {
        target: { type: "character", characterId: memory.characterId },
        text: nextNote,
        secretId: memory.secretId,
      });
      nextRoom = addResult.room;
      if (memory.visibility === "character" && addResult.entry) {
        const revealResult = revealTavernSecretMemory(nextRoom, {
          secretId: addResult.entry.secretId ?? memory.secretId ?? "",
          visibility: "character",
          targetCharacterIds: memory.revealToCharacterIds,
        });
        nextRoom = revealResult.room;
      }
    }

    patchRoom(activeRoom.id, {
      sceneInstances: nextRoom.sceneInstances,
      lorebookEntries: [
        ...activeRoom.lorebookEntries,
        ...lorebookEntries.map((entry) => createTavernLorebookEntry(entry)),
      ],
      assetDrafts: activeRoom.assetDrafts.filter((item) => item.id !== draftId),
    });
  };
  const deleteAssetDraft = (draftId: string) => {
    if (!activeRoom) {
      return;
    }
    const draft = activeRoom.assetDrafts.find((item) => item.id === draftId);
    if (!draft) {
      return;
    }

    setPendingConfirmAction({
      title: "忽略草稿",
      description:
        "忽略这份待确认草稿？草稿中的记忆和世界书建议都会被删除。",
      confirmLabel: "忽略草稿",
      onConfirm: () => {
        const room = projectTavernSceneOntoRoom(activeRoom);
        patchRoom(activeRoom.id, {
          assetDrafts: room.assetDrafts.filter((item) => item.id !== draftId),
        });
      },
    });
  };

  return (
    <>
      <PlotDataSheet
        bind={bind}
        title="剧情资产草稿"
        description="确认或忽略系统整理出的剧情资产。"
      >
        {activeRoom?.assetDrafts.length ? (
          <div className="space-y-3">
            {activeRoom.assetDrafts.map((draft, index) => (
              <AssetDraftPreview
                key={draft.id}
                draft={draft}
                index={index}
                roomCharacters={roomCharacters}
                isBusy={isBusy}
                onApply={() => applyAssetDraft(draft.id)}
                onDelete={() => deleteAssetDraft(draft.id)}
              />
            ))}
          </div>
        ) : (
          <EmptyDetailState>暂无待确认草稿。</EmptyDetailState>
        )}
      </PlotDataSheet>
      <ConfirmActionDialog
        action={pendingConfirmAction}
        onClose={() => setPendingConfirmAction(null)}
      />
    </>
  );
};
