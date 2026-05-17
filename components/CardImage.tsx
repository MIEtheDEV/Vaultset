"use client";

import { useState } from "react";

interface Props {
  src: string;
  alt: string;
}

export function CardImage({ src, alt }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group/img relative h-full w-full flex items-center justify-center p-8"
        aria-label="Enlarge card image"
      >
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-contain drop-shadow-lg transition-transform duration-200 group-hover/img:scale-[1.03]"
        />
        <span className="absolute bottom-2 right-2 opacity-0 group-hover/img:opacity-100 transition-opacity rounded-full bg-background/70 backdrop-blur-sm p-1.5 text-foreground-muted">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm p-6"
          onClick={() => setOpen(false)}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute top-4 right-4 rounded-full bg-surface border border-border p-2 text-foreground-muted hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <img
            src={src}
            alt={alt}
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-2xl drop-shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
