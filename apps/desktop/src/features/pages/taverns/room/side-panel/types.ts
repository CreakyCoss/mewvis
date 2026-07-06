import type { Ref } from "react";

export type SidePanelHandle = {
  show: () => void;
  hide: () => void;
  toggle: () => void;
};

export type SidePanelProps = {
  bind: Ref<SidePanelHandle>;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};
