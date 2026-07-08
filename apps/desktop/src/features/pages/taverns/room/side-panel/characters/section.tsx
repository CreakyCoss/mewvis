import type { ReactNode } from "react";
import { compact, uniq } from "lodash-es";
import { BookOpenText, ChevronRight, MessageCircle, Shield, Target, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { resolveAvatar } from "@/assets/avatars";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";
import { formatTavernCharacterRelationshipSummary } from "@/features/pages/taverns/tavern/core/relationships";
import { isTavernRoomBusy, useTavernRoomContext } from "@/features/pages/taverns/room/context";
import { getVisualPreset } from "@/features/pages/taverns/tavern/visual-presets";
import { getCurrentTimestamp } from "@/utils/time";
import { getTavernRoomCharacterMemoryLayers, getTavernRoomCharacters, getTavernRoomSceneFields } from "../../model";
import { EmptyPanelCard, emptyValueText } from "../shared";

const trimText = (value: string | undefined) => value?.trim() ?? "";

const trimArray = (values: string[] | undefined) => compact(values?.map((value) => value.trim()) ?? []);

const splitLines = (value: string | undefined) =>
  compact(
    trimText(value)
      .split(/\n+/)
      .map((line) => line.trim()),
  );

const splitPhrases = (value: string | undefined) =>
  trimText(value)
    .split(/[，,、；;。.!！？?]+/)
    .map((phrase) => phrase.trim())
    .filter((phrase) => phrase.length > 0 && phrase.length <= 8)
    .slice(0, 3);

const unique = (values: string[]) => uniq(values.filter(Boolean));

const Pill = ({ children }: { children: ReactNode }) => (
  <span className="max-w-full truncate rounded-md bg-primary/10 px-1.5 py-1 text-[11px] font-medium leading-none text-primary">
    {children}
  </span>
);

const DetailSection = ({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) => (
  <section className="rounded-lg border border-current/10 bg-current/[0.06] p-2.5 shadow-sm dark:bg-current/[0.085]">
    <div className="mb-2 flex min-w-0 items-center gap-2 text-[12px] font-semibold text-current">
      <Icon className="size-4 shrink-0 text-primary" />
      <span className="truncate">{title}</span>
    </div>
    {children}
  </section>
);

const LineList = ({ lines, empty = emptyValueText }: { lines: string[]; empty?: string }) => {
  if (lines.length === 0) {
    return <div className="text-xs leading-5 text-current/60">{empty}</div>;
  }

  return (
    <ul className="space-y-1.5 text-xs leading-5 text-current/80">
      {lines.map((line, index) => (
        <li key={`${line}-${index}`} className="flex gap-2">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-current/70" />
          <span className="min-w-0 whitespace-pre-wrap">{line}</span>
        </li>
      ))}
    </ul>
  );
};

const CharacterDetail = ({ character }: { character: TavernCharacter }) => {
  const activeRoom = useTavernRoomContext((store) => store.activeRoom);
  if (!activeRoom) {
    return null;
  }

  const sceneFields = getTavernRoomSceneFields(activeRoom);
  const characterMemoryLayers = getTavernRoomCharacterMemoryLayers(activeRoom, character.id);
  const avatar = resolveAvatar(character.avatar).src;
  const publicStatus = sceneFields.characterPublicStatuses[character.id];
  const privateStatus = sceneFields.characterPrivateStatuses[character.id];
  const holding = trimArray(publicStatus?.holding);
  const privateKnowledge = trimArray(privateStatus?.privateKnowledge);
  const speakingPhrases = splitPhrases(character.speakingStyle);
  const headerPills = unique([
    trimText(publicStatus?.visibleMood),
    trimText(publicStatus?.posture),
    ...speakingPhrases,
  ]).slice(0, 4);
  const profileSummary =
    trimText(character.description) ||
    trimText(publicStatus?.publicGoal) ||
    trimText(character.goals) ||
    trimText(character.speakingStyle);
  const stanceLines = [
    publicStatus?.location ? `位置：${publicStatus.location}` : "",
    publicStatus?.posture ? `姿态：${publicStatus.posture}` : "",
    publicStatus?.visibleMood ? `外显情绪：${publicStatus.visibleMood}` : "",
    publicStatus?.outfit ? `装束：${publicStatus.outfit}` : "",
    publicStatus?.visibleInjury ? `可见伤势：${publicStatus.visibleInjury}` : "",
    holding.length > 0 ? `持有：${holding.join("、")}` : "",
    privateStatus?.privateMood ? `私下情绪：${privateStatus.privateMood}` : "",
    privateStatus?.suspicion ? `疑虑：${privateStatus.suspicion}` : "",
  ].filter(Boolean);
  const goalLines = [
    ...splitLines(character.goals),
    publicStatus?.publicGoal ? `公开目标：${publicStatus.publicGoal}` : "",
    privateStatus?.hiddenGoal ? `隐藏目标：${privateStatus.hiddenGoal}` : "",
  ].filter(Boolean);
  const styleLines = [
    trimText(character.speakingStyle),
    character.writingStyle ? `叙述：${character.writingStyle}` : "",
    character.replyStylePrompt ? `回复约束：${character.replyStylePrompt}` : "",
  ].filter(Boolean);
  const relationshipSummary = formatTavernCharacterRelationshipSummary({
    character,
    characters: getTavernRoomCharacters(activeRoom),
    room: {
      userPersonaName: activeRoom.user.personaName,
      relationshipOverrides: sceneFields.relationshipOverrides,
    },
    maxItems: 4,
  });
  const relationshipLines = splitLines(relationshipSummary);
  const memoryLines = unique([
    trimText(sceneFields.characterMemories[character.id]),
    trimText(characterMemoryLayers?.required),
    trimText(characterMemoryLayers?.public),
    trimText(characterMemoryLayers?.known),
    trimText(characterMemoryLayers?.privateSelf),
    privateKnowledge.length > 0 ? `已知信息：${privateKnowledge.join("、")}` : "",
  ]);
  const visualPreset = getVisualPreset(sceneFields.scenePresetId);

  return (
    <HoverCardContent
      side="left"
      align="start"
      sideOffset={8}
      className="w-[36rem] max-w-[calc(100vw-2rem)] !bg-transparent !p-0 text-left !shadow-none !ring-0"
    >
      <div
        className={cn(
          "space-y-2.5 rounded-xl border p-2.5 shadow-xl ring-1 ring-current/10",
          visualPreset.tavern.page,
          visualPreset.tavern.sidePanel,
        )}
      >
        <div className="overflow-hidden rounded-lg border border-current/10 bg-current/[0.075] shadow-sm dark:bg-current/[0.1]">
          <div className="grid min-h-36 md:grid-cols-[10.5rem_minmax(0,1fr)]">
            <div className="min-h-36 bg-current/10">
              <img src={avatar} alt="" className="size-full object-cover" />
            </div>
            <div className="min-w-0 p-4">
              <div className="truncate text-xl font-semibold leading-tight text-current">{character.name}</div>
              {headerPills.length > 0 && (
                <div className="mt-2.5 flex min-w-0 flex-wrap gap-1.5">
                  {headerPills.map((pill) => (
                    <Pill key={pill}>{pill}</Pill>
                  ))}
                </div>
              )}
              <div className="mt-3 line-clamp-3 text-[13px] leading-6 text-current/70">
                {profileSummary || "暂无角色设定"}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-2.5 md:grid-cols-2">
          <DetailSection icon={Shield} title="当前立场">
            <LineList lines={stanceLines} empty="暂无公开状态" />
          </DetailSection>
          <DetailSection icon={Target} title="目标">
            <LineList lines={goalLines} empty="暂无目标" />
          </DetailSection>
          <DetailSection icon={MessageCircle} title="说话方式">
            {speakingPhrases.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {speakingPhrases.map((phrase) => (
                  <Pill key={phrase}>{phrase}</Pill>
                ))}
              </div>
            )}
            <LineList lines={styleLines} empty="暂无说话方式" />
          </DetailSection>
          <DetailSection icon={UsersRound} title="关系">
            <LineList lines={relationshipLines} empty="暂无关系记录" />
          </DetailSection>
        </div>

        <DetailSection icon={BookOpenText} title="角色记忆">
          <LineList lines={memoryLines} empty="暂无稳定记忆" />
        </DetailSection>
      </div>
    </HoverCardContent>
  );
};

const CharacterCardContent = ({ character, isActive }: { character: TavernCharacter; isActive: boolean }) => {
  const activeRoom = useTavernRoomContext((store) => store.activeRoom);
  const avatar = resolveAvatar(character.avatar).src;
  const publicStatus = activeRoom
    ? getTavernRoomSceneFields(activeRoom).characterPublicStatuses[character.id]
    : undefined;
  const chipTexts = unique([
    trimText(publicStatus?.visibleMood),
    trimText(publicStatus?.posture),
    trimText(publicStatus?.location),
  ]).slice(0, 2);

  if (isActive) {
    return (
      <span className="block space-y-3">
        <span className="flex min-w-0 items-center gap-3">
          <img
            src={avatar}
            alt=""
            className="size-12 shrink-0 rounded-lg border border-current/15 bg-current/[0.045] object-cover shadow-sm dark:bg-current/[0.065]"
          />
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center">
              <span className="truncate text-sm font-semibold leading-tight">{character.name}</span>
            </span>
            <span className="mt-1 line-clamp-2 block text-[11px] leading-4 text-current/65">
              {character.speakingStyle || character.description || "当前默认发言角色"}
            </span>
          </span>
        </span>
        {chipTexts.length > 0 ? (
          <span className="flex flex-wrap gap-1.5">
            {chipTexts.map((chip) => (
              <Pill key={chip}>{chip}</Pill>
            ))}
          </span>
        ) : (
          <span className="block rounded-lg border border-current/10 bg-current/[0.06] px-3 py-2.5 text-xs text-current/65 dark:bg-current/[0.085]">
            暂无公开状态
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <img
        src={avatar}
        alt=""
        className="size-10 shrink-0 rounded-lg border border-current/15 bg-current/[0.045] object-cover shadow-sm dark:bg-current/[0.065]"
      />
      <span className="min-w-[4.5rem] max-w-[5.5rem] truncate text-[13px] font-semibold leading-tight">
        {character.name}
      </span>
      <span className="min-w-0 flex-1 truncate text-[11px] text-current/65">
        {publicStatus?.publicGoal || publicStatus?.visibleMood || character.description || "入席角色"}
      </span>
      <ChevronRight className="size-4 shrink-0 text-current/60" />
    </span>
  );
};

const CharacterCard = ({
  character,
  isActive,
  disabled,
  onClick,
}: {
  character: TavernCharacter;
  isActive: boolean;
  disabled: boolean;
  onClick: () => void;
}) => (
  <HoverCard openDelay={120} closeDelay={120}>
    <HoverCardTrigger asChild>
      <button
        type="button"
        className={cn(
          "w-full min-w-0 rounded-xl border border-current/10 bg-current/[0.055] p-2.5 text-left text-current shadow-sm transition-colors hover:bg-current/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 dark:bg-current/[0.075]",
          isActive && "border-primary/30 bg-primary/10 ring-1 ring-primary/10",
        )}
        disabled={disabled}
        onClick={onClick}
      >
        <CharacterCardContent character={character} isActive={isActive} />
      </button>
    </HoverCardTrigger>
    <CharacterDetail character={character} />
  </HoverCard>
);

export const CharacterStatusSection = () => {
  const activeRoom = useTavernRoomContext((store) => store.activeRoom);
  const activeCharacter = useTavernRoomContext((store) => store.activeCharacter);
  const roomCharacters = useTavernRoomContext((store) => store.roomCharacters);
  const busy = useTavernRoomContext((store) => store.busy);
  const patchRoom = useTavernRoomContext((store) => store.patchRoom);

  if (!activeRoom) {
    return null;
  }
  const isBusy = isTavernRoomBusy(busy);

  return (
    <section className="space-y-3">
      <div className="flex min-h-8 items-center gap-2 text-sm font-semibold leading-tight text-current">
        <UsersRound className="size-4 shrink-0 text-primary" />
        <span className="truncate">入席角色</span>
      </div>
      <div className="space-y-2">
        {roomCharacters.map((character) => {
          return (
            <CharacterCard
              key={character.id}
              character={character}
              isActive={character.id === activeCharacter?.id}
              disabled={isBusy}
              onClick={() =>
                patchRoom(activeRoom.identity.id, (room) => {
                  const updatedAt = getCurrentTimestamp();
                  return {
                    ...room,
                    identity: {
                      ...room.identity,
                      updatedAt,
                    },
                    config: {
                      room: {
                        ...room.config.room,
                        updatedAt,
                      },
                    },
                    cast: {
                      ...room.cast,
                      activeCharacterId: character.id,
                    },
                    scene: {
                      ...room.scene,
                      activeCharacterId: character.id,
                      updatedAt,
                    },
                  };
                })
              }
            />
          );
        })}
        {roomCharacters.length === 0 && <EmptyPanelCard>还没有角色入席。</EmptyPanelCard>}
      </div>
    </section>
  );
};
