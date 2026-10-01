import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Toaster } from "design-system/components/ui/sonner";

const ToastLayer = createContext<(container: HTMLElement) => () => void>(
  () => () => {},
);

export const useToastLayer = () => useContext(ToastLayer);

export function Notifications({ children }: { children: ReactNode }) {
  const [containers, setContainers] = useState<HTMLElement[]>([]);
  const registerLayer = useCallback((container: HTMLElement) => {
    setContainers((current) => [...current, container]);
    return () =>
      setContainers((current) => current.filter((item) => item !== container));
  }, []);
  const container = containers.at(-1);
  const [layer] = useState(() => document.createElement("div"));
  useLayoutEffect(() => {
    // Keep the toaster mounted while moving it into native dialogs' top layer.
    (container ?? document.body).appendChild(layer);
    return () => layer.remove();
  }, [container, layer]);
  return (
    <ToastLayer.Provider value={registerLayer}>
      {children}
      {createPortal(
        <Toaster
          position="top-right"
          containerAriaLabel="操作提示"
          duration={1500}
          visibleToasts={2}
          // Keep toast positions and heights stable when the pointer enters or leaves.
          expand
          richColors
          closeButton
          toastOptions={{
            classNames: { toast: "cn-toast wk-toast" },
            closeButtonAriaLabel: "关闭提示",
          }}
        />,
        layer,
      )}
    </ToastLayer.Provider>
  );
}
