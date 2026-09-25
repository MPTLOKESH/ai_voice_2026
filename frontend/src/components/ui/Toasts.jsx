import { CircleAlert, Info } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { cn } from "../../lib/cn.js";

const ToastContext = createContext(() => {});

/** `toast(message, kind)` from anywhere below. Problems stay up longer than notes. */
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const next = useRef(0);

  const toast = useCallback((message, kind = "note") => {
    const id = ++next.current;
    setToasts((all) => [...all, { id, message, kind }]);
    setTimeout(() => setToasts((all) => all.filter((one) => one.id !== id)), kind === "bad" ? 6000 : 3500);
  }, []);

  const value = useMemo(() => toast, [toast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-24 z-50 flex w-80 lg:bottom-6 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map(({ id, message, kind }) => {
          const Icon = kind === "bad" ? CircleAlert : Info;
          return (
            <div key={id} role={kind === "bad" ? "alert" : "status"}
                 className={cn("pointer-events-auto flex items-start gap-2.5 rounded-xl bg-white px-4 py-3 text-[13px] shadow-float",
                               "animate-[toast-in_.18s_ease-out]",
                               "text-ink")}>
              <Icon aria-hidden="true" strokeWidth={1.75}
                    className={cn("mt-px size-4 shrink-0", kind === "bad" ? "text-bad" : "text-muted")} />
              <span className="leading-snug">{message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
