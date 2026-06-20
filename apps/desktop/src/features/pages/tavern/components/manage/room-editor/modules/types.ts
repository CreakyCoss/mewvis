import type { ReactNode } from "react";
import type { TavernRoom } from "../../../../types";

export type TextFieldAgentActionRenderer = (options: {
  fieldKey: string;
  fieldLabel: string;
  currentText: string;
  applyText: (text: string) => void;
  context?: Record<string, unknown>;
}) => ReactNode;

export type ModuleSave = (patch: Partial<TavernRoom>) => void;

export type ModuleEditProps = {
  data: TavernRoom;
  onSave: ModuleSave;
  renderTextFieldAgentActions: TextFieldAgentActionRenderer;
};
