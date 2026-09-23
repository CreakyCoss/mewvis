import { createContext, useContext } from "react";
import type { ExtensionViewTransport } from "../protocol/transport";
export const ViewTransportContext =
  createContext<ExtensionViewTransport | null>(null);
export function useViewTransport() {
  const value = useContext(ViewTransportContext);
  if (!value) throw new Error("Plugin UI transport has not been bound");
  return value;
}
