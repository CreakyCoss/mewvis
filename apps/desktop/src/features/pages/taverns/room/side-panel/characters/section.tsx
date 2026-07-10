import type { ReactNode } from "react";
import { compact, uniq } from "lodash-es";
import { BookOpenText, ChevronRight, MessageCircle, Shield, Target, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { resolveAvatar } from "@/assets/avatars";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import type { TavernCharacter } from "@/features/pages/taverns/room/model";
import { useTavernRoomContext } from "@/features/pages/taverns/room/context";
import { getVisualPreset } from "@/features/pages/taverns/tavern/visual-presets";
import { EmptyPanelCard, emptyValueText } from "../shared";

const trimText = (value: string | undefined) => value?.trim() ?? "";

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
  const story = useTavernRoomContext((store) => store.story);
  if (!story) {
    return null;
  }

  const avatar = resolveAvatar(character.avatar).src;
  const speakingPhrases = splitPhrases(character.speakingStyle);
  const headerPills = unique(speakingPhrases).slice(0, 4);
  const profileSummary =
    trimText(character.description) || trimText(character.goals) || trimText(character.speakingStyle);
  const stanceLines = splitLines(character.publicRelationshipSummary);
  const goalLines = splitLines(character.goals);
  const styleLines = [
    trimText(character.speakingStyle),
    character.writingStyle ? `叙述：${character.writingStyle}` : "",
    character.replyStylePrompt ? `回复约束：${character.replyStylePrompt}` : "",
  ].filter(Boolean);
  const relationshipLines = unique([
    ...splitLines(character.publicRelationshipSummary),
    ...splitLines(character.relationshipSummary),
  ]);
  const memoryLines = unique([
    trimText(character.memory?.required),
    trimText(character.memory?.public),
    trimText(character.memory?.known),
    trimText(character.memory?.privateSelf),
  ]);
  const visualPreset = getVisualPreset(story.roomConfig.scenePresetId);

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
          <DetailSection icon={Shield} title="公开立场">
            <LineList lines={stanceLines} empty="暂无公开立场" />
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

const CharacterCardContent = ({ character }: { character: TavernCharacter }) => {
  const avatar = resolveAvatar(character.avatar).src;

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
        {character.description || character.goals || "入席角色"}
      </span>
      <ChevronRight className="size-4 shrink-0 text-current/60" />
    </span>
  );
};

const CharacterCard = ({ character }: { character: TavernCharacter }) => (
  <HoverCard openDelay={120} closeDelay={120}>
    <HoverCardTrigger asChild>
      <div className="w-full min-w-0 rounded-xl border border-current/10 bg-current/[0.055] p-2.5 text-left text-current shadow-sm transition-colors hover:bg-current/10 dark:bg-current/[0.075]">
        <CharacterCardContent character={character} />
      </div>
    </HoverCardTrigger>
    <CharacterDetail character={character} />
  </HoverCard>
);

export const CharacterStatusSection = () => {
  const story = useTavernRoomContext((store) => store.story);

  if (!story) {
    return null;
  }

  return (
    <section className="space-y-3">
      <div className="flex min-h-8 items-center gap-2 text-sm font-semibold leading-tight text-current">
        <UsersRound className="size-4 shrink-0 text-primary" />
        <span className="truncate">入席角色</span>
      </div>
      <div className="space-y-2">
        {story.characters.map((character) => (
          <CharacterCard key={character.id} character={character} />
        ))}
        {story.characters.length === 0 && <EmptyPanelCard>还没有角色入席。</EmptyPanelCard>}
      </div>
    </section>
  );
};
