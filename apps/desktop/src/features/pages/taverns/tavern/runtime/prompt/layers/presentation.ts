import type { TavernPresentationProfile } from "@/features/pages/taverns/manage/model";
import type { TavernPromptSection } from "../shared/sections";

export const buildPresentationProfileSection = ({
  presentationProfile,
  target,
}: {
  presentationProfile: TavernPresentationProfile;
  target: "bridge" | "character";
}): TavernPromptSection => ({
  id: "presentation-profile",
  layer: "tavern",
  tag: "presentation_profile",
  attributes:
    target === "character"
      ? {
          id: presentationProfile.id,
          label: presentationProfile.label,
          render: presentationProfile.renderStyle,
          contract: presentationProfile.generationContract,
        }
      : {
          id: presentationProfile.id,
          label: presentationProfile.label,
        },
  content: target === "bridge" ? presentationProfile.bridgeSystemAddendum : presentationProfile.characterAddendum,
});
