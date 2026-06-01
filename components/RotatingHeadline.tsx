"use client";

import { useEffect, useState } from "react";

const MESSAGES = [
  "Finally know what your collection is actually worth.",
  "Stop tracking your Pokémon cards in a spreadsheet.",
  "The Pokémon TCG platform collectors have been waiting for.",
];

const DISPLAY_MS = 5500;
const FADE_MS    = 600;

export function RotatingHeadline() {
  const [index, setIndex] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setIndex((i) => (i + 1) % MESSAGES.length);
        setFading(false);
      }, FADE_MS);
    }, DISPLAY_MS + FADE_MS);

    return () => clearInterval(interval);
  }, []);

  return (
    // Grid-stack: all messages occupy the same cell so container height never shifts
    <span className="block" style={{ display: "grid" }} aria-live="polite">
      {MESSAGES.map((msg, i) => (
        <span
          key={i}
          style={{
            gridArea: "1/1",
            opacity: i === index ? (fading ? 0 : 1) : 0,
            transition: `opacity ${FADE_MS}ms ease-in-out`,
            pointerEvents: i === index ? "auto" : "none",
          }}
          aria-hidden={i !== index}
        >
          {msg}
        </span>
      ))}
    </span>
  );
}
