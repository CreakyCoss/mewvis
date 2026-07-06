import type { TavernRuntimeRoom as TavernRoom } from "@/features/pages/taverns/room/model";
import type { TavernInformationPolicy, TavernRoomSettings } from "@/features/pages/taverns/manage/model";

export type TavernInformationView = "public" | "reveal" | "director";

export const resolveTavernInformationView = ({
  policy,
}: {
  policy: TavernInformationPolicy;
}): TavernInformationView => {
  if (policy.uiDefaultView === "director") {
    return "director";
  }

  if (policy.uiDefaultView === "reveal") {
    return "reveal";
  }

  return "public";
};

export const shouldShowTavernCharacterThoughts = ({ settings }: { settings: TavernRoomSettings }) => {
  const policy = settings.informationPolicy;
  if (!policy.hideCharacterThoughts) {
    return true;
  }

  const view = resolveTavernInformationView({ policy });
  return view === "reveal" || view === "director";
};

export const shouldShowTavernHiddenFacts = ({ room }: { room: Pick<TavernRoom, "settings"> }) => {
  const policy = room.settings.informationPolicy;
  if (!policy.hiddenFacts.enabled) {
    return true;
  }

  const view = resolveTavernInformationView({ policy });
  return view === "reveal" || view === "director";
};
