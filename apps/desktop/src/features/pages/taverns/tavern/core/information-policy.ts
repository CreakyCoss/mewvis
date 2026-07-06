import type { TavernRuntimeRoom as TavernRoom } from "@/features/pages/taverns/room/model";
import type {
  TavernFactEvent,
  TavernInformationPolicy,
  TavernOutcomeEvent,
  TavernRoomSettings,
} from "@/features/pages/taverns/manage/model";

export type TavernInformationView = "public" | "reveal" | "director";
export type TavernFactAudience =
  | { type: "public" | "ui" }
  | { type: "user" }
  | { type: "director" }
  | { type: "character"; characterId: string; factionIds?: string[] };

export const hasAppliedTavernSceneOutcome = (outcomeEvents?: TavernOutcomeEvent[] | null) =>
  (outcomeEvents ?? []).some((event) => event.status === "applied");

export const resolveTavernInformationView = ({
  policy,
  outcomeEvents,
}: {
  policy: TavernInformationPolicy;
  outcomeEvents?: TavernOutcomeEvent[] | null;
}): TavernInformationView => {
  if (policy.uiDefaultView === "director") {
    return "director";
  }

  if (policy.uiDefaultView === "reveal") {
    return "reveal";
  }

  if (
    (policy.revealThoughts === "sceneOutcome" || policy.hiddenFacts.reveal === "sceneOutcome") &&
    hasAppliedTavernSceneOutcome(outcomeEvents)
  ) {
    return "reveal";
  }

  return "public";
};

export const shouldShowTavernCharacterThoughts = ({
  settings,
  outcomeEvents,
}: {
  settings: TavernRoomSettings;
  outcomeEvents?: TavernOutcomeEvent[] | null;
}) => {
  const policy = settings.informationPolicy;
  if (!policy.hideCharacterThoughts) {
    return true;
  }

  const view = resolveTavernInformationView({
    policy,
    outcomeEvents,
  });
  return view === "reveal" || view === "director";
};

export const shouldShowTavernHiddenFacts = ({ room }: { room: Pick<TavernRoom, "settings" | "outcomeEvents"> }) => {
  const policy = room.settings.informationPolicy;
  if (!policy.hiddenFacts.enabled) {
    return true;
  }

  const view = resolveTavernInformationView({
    policy,
    outcomeEvents: room.outcomeEvents,
  });
  return view === "reveal" || view === "director";
};

const audienceIsExplicitlyAllowed = (factEvent: TavernFactEvent, audience: TavernFactAudience) => {
  if (audience.type !== "character") {
    return audience.type === "user" && factEvent.visibleToUser === true;
  }

  if (factEvent.visibleToCharacterIds?.includes(audience.characterId)) {
    return true;
  }

  const audienceFactionIds = new Set(audience.factionIds ?? []);
  return Boolean(factEvent.visibleToFactionIds?.some((factionId) => audienceFactionIds.has(factionId)));
};

export const canTavernAudienceSeeFactEvent = ({
  factEvent,
  policy,
  outcomeEvents,
  audience,
}: {
  factEvent: TavernFactEvent;
  policy: TavernInformationPolicy;
  outcomeEvents?: TavernOutcomeEvent[] | null;
  audience: TavernFactAudience;
}) => {
  if (audience.type === "director") {
    return true;
  }

  if (audienceIsExplicitlyAllowed(factEvent, audience)) {
    return true;
  }

  const visibility = factEvent.visibility ?? "public";
  if (visibility === "public") {
    return true;
  }

  const view = resolveTavernInformationView({
    policy,
    outcomeEvents,
  });
  if (view === "reveal") {
    return factEvent.revealWhen !== "never" && policy.hiddenFacts.reveal !== "never";
  }

  return false;
};

export const filterTavernFactEventsForAudience = ({
  factEvents,
  room,
  audience,
}: {
  factEvents: TavernFactEvent[];
  room: Pick<TavernRoom, "settings" | "outcomeEvents">;
  audience: TavernFactAudience;
}) =>
  factEvents.filter((factEvent) =>
    canTavernAudienceSeeFactEvent({
      factEvent,
      policy: room.settings.informationPolicy,
      outcomeEvents: room.outcomeEvents,
      audience,
    }),
  );
