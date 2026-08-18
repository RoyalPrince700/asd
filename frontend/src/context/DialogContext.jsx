import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

const DialogContext = createContext(null);

let toastId = 0;

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const [toasts, setToasts] = useState([]);
  const resolveRef = useRef(null);
  const confirmBtnRef = useRef(null);

  const closeDialog = useCallback((result) => {
    setDialog(null);
    resolveRef.current?.(result);
    resolveRef.current = null;
  }, []);

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setDialog({
        type: "confirm",
        title: options.title ?? "Confirm",
        message: options.message ?? "",
        confirmLabel: options.confirmLabel ?? "Confirm",
        cancelLabel: options.cancelLabel ?? "Cancel",
        variant: options.variant ?? "default",
      });
    });
  }, []);

  const alert = useCallback((options) => {
    return new Promise((resolve) => {
      resolveRef.current = () => resolve();
      setDialog({
        type: "alert",
        title: options.title ?? "Notice",
        message: options.message ?? "",
        confirmLabel: options.okLabel ?? "OK",
        variant: options.variant ?? "default",
      });
    });
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((list) => list.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (options) => {
      const id = ++toastId;
      const duration = options.duration ?? 4000;
      setToasts((list) => [
        ...list,
        {
          id,
          message: options.message ?? "",
          type: options.type ?? "info",
        },
      ]);
      if (duration > 0) {
        window.setTimeout(() => dismissToast(id), duration);
      }
      return id;
    },
    [dismissToast]
  );

  useEffect(() => {
    if (!dialog) return;

    function onKeyDown(e) {
      if (e.key === "Escape") {
        closeDialog(dialog.type === "confirm" ? false : undefined);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    confirmBtnRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [dialog, closeDialog]);

  const value = useMemo(
    () => ({ confirm, alert, toast }),
    [confirm, alert, toast]
  );

  return (
    <DialogContext.Provider value={value}>
      {children}

      {dialog ? (
        <div
          className="dialog-overlay"
          role="presentation"
          onClick={() =>
            closeDialog(dialog.type === "confirm" ? false : undefined)
          }
        >
          <div
            className={`dialog${dialog.variant === "danger" ? " dialog--danger" : ""}`}
            role={dialog.type === "confirm" ? "alertdialog" : "dialog"}
            aria-modal="true"
            aria-labelledby="dialog-title"
            aria-describedby="dialog-message"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dialog-icon" aria-hidden="true">
              {dialog.variant === "danger" ? (
                <AlertTriangle size={22} />
              ) : (
                <Info size={22} />
              )}
            </div>
            <h2 id="dialog-title" className="dialog-title">
              {dialog.title}
            </h2>
            <p id="dialog-message" className="dialog-message">
              {dialog.message}
            </p>
            <div className="dialog-actions">
              {dialog.type === "confirm" ? (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => closeDialog(false)}
                >
                  {dialog.cancelLabel}
                </button>
              ) : null}
              <button
                ref={confirmBtnRef}
                type="button"
                className={
                  dialog.variant === "danger" ? "dialog-btn-danger" : undefined
                }
                onClick={() =>
                  closeDialog(dialog.type === "confirm" ? true : undefined)
                }
              >
                {dialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map((item) => (
          <div
            key={item.id}
            className={`toast toast--${item.type}`}
            role="status"
          >
            <span className="toast-icon" aria-hidden="true">
              {item.type === "success" ? (
                <CheckCircle2 size={18} />
              ) : item.type === "error" ? (
                <AlertTriangle size={18} />
              ) : (
                <Info size={18} />
              )}
            </span>
            <span className="toast-message">{item.message}</span>
            <button
              type="button"
              className="toast-close"
              aria-label="Dismiss"
              onClick={() => dismissToast(item.id)}
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error("useDialog must be used within DialogProvider");
  }
  return ctx;
}
