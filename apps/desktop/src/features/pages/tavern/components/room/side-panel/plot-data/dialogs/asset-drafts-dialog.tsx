import { useState } from "react";
import { Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createTavernLorebookEntry,
  createTavernTimelineEvent,
  projectTavernSceneOntoRoom,
} from "../../../../../storage";
import type {
  TavernAssetDraft,
  TavernCharacter,
} from "../../../../../types";
import { useTavernPageContext } from "../../../../context";
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
  const draftSummary = [
    draft.timelineEvents.length > 0 ? `${draft.timelineEvents.length} 时间线` : "",
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

      {draft.timelineEvents.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-medium opacity-70">时间线</div>
          {draft.timelineEvents.map((event) => (
            <div key={event.id} className="rounded-md bg-current/5 px-2.5 py-2">
              <div className="text-xs font-medium">{event.title || emptyValueText}</div>
              <div className="mt-1 whitespace-pre-wrap text-xs leading-5 opacity-70">
                {event.summary || emptyValueText}
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

    const timelineEvents = draft.timelineEvents.filter((event) =>
      event.title.trim() && event.summary.trim()
    );
    const memoryDrafts = draft.characterMemories.filter((memory) =>
      memory.characterId.trim() && memory.note.trim()
    );
    const lorebookEntries = draft.lorebookEntries.filter((entry) =>
      entry.title.trim() && entry.content.trim()
    );
    const characterMemories = { ...activeRoom.characterMemories };
    const characterConfigs = { ...(activeRoom.characterConfigs ?? {}) };
    for (const memory of memoryDrafts) {
      const existing = characterMemories[memory.characterId]?.trim() ?? "";
      const nextNote = memory.note.trim();
      characterMemories[memory.characterId] = existing
        ? [existing, nextNote].join("\n")
        : nextNote;
      characterConfigs[memory.characterId] = {
        ...(characterConfigs[memory.characterId] ?? { characterId: memory.characterId }),
        memory: characterMemories[memory.characterId],
      };
    }

    patchRoom(activeRoom.id, {
      characterConfigs,
      characterMemories,
      timelineEvents: [
        ...activeRoom.timelineEvents,
        ...timelineEvents.map((event) => createTavernTimelineEvent(event)),
      ],
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
        "忽略这份待确认草稿？草稿中的时间线、记忆和世界书建议都会被删除。",
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
