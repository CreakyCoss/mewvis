import {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Toaster } from "design-system/components/ui/sonner";

const ToastLayer = createContext<(container: HTMLElement | null) => void>(
  () => {},
);

export const useToastLayer = () => useContext(ToastLayer);

export function Notifications({ children }: { children: ReactNode }) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [layer] = useState(() => document.createElement("div"));
  useLayoutEffect(() => {
    // Keep the toaster mounted while moving it into native dialogs' top layer.
    (container ?? document.body).appendChild(layer);
    return () => layer.remove();
  }, [container, layer]);
  return (
    <ToastLayer.Provider value={setContainer}>
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
