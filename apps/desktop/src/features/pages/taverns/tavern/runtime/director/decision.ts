type TavernDirectorDecisionRoom = {
  settings: {
    randomEvents: {
      enabled: boolean;
      probability: number;
    };
  };
};

export const shouldOfferTavernDirectorRandomEvent = (room: TavernDirectorDecisionRoom, random = Math.random) => {
  if (!room.settings.randomEvents.enabled) {
    return false;
  }

  const probability = Math.min(1, Math.max(0, room.settings.randomEvents.probability));
  return random() < probability;
};
