import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { DialogRuntime } from "./dialogs";
import type { ExtensionUIContribution } from "../protocol/transport";
const Context = createContext<DialogRuntime | null>(null);
export function DialogRuntimeProvider({
  contributions,
  children,
}: {
  contributions: readonly ExtensionUIContribution[];
  children: ReactNode;
}) {
  const [runtime] = useState(() => new DialogRuntime());
  useEffect(() => runtime.update(contributions), [runtime, contributions]);
  return <Context.Provider value={runtime}>{children}</Context.Provider>;
}
export function useDialogRuntime() {
  const value = useContext(Context);
  if (!value) throw new Error("PluginUIProvider is required");
  return value;
}
