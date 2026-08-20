import { useEffect, useState } from "react";
import { X } from "lucide-react";

const PREVIEW_LENGTH = 48;

function truncate(text, max = PREVIEW_LENGTH) {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trim()}…`;
}

export function RequestDetailsCell({ details, title = "Request details" }) {
  const [open, setOpen] = useState(false);
  const text = details?.trim() || "";

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!text) {
    return <span className="hint">—</span>;
  }

  return (
    <>
      <button
        type="button"
        className="request-details-preview"
        onClick={() => setOpen(true)}
        title="Read full details"
      >
        {truncate(text)}
      </button>

      {open ? (
        <div
          className="dialog-overlay"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            className="dialog dialog--read"
            role="dialog"
            aria-modal="true"
            aria-labelledby="request-details-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="dialog-close"
              aria-label="Close"
              onClick={() => setOpen(false)}
            >
              <X size={18} />
            </button>
            <h2 id="request-details-title" className="dialog-title">
              {title}
            </h2>
            <p className="dialog-body">{text}</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
