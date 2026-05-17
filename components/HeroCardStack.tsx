"use client";

import { useState, useEffect } from "react";

const CARDS = [
  {
    id:     "charizard",
    src:    "https://images.pokemontcg.io/base1/4_hires.png",
    alt:    "Charizard",
    name:   "Charizard #4",
    set:    "Base Set — 1999",
    rarity: "Rare Holo",
    price:  "$4,200.00",
  },
  {
    id:     "blastoise",
    src:    "https://images.pokemontcg.io/base1/2_hires.png",
    alt:    "Blastoise",
    name:   "Blastoise #2",
    set:    "Base Set — 1999",
    rarity: "Rare Holo",
    price:  "$1,800.00",
  },
  {
    id:     "venusaur",
    src:    "https://images.pokemontcg.io/base1/15_hires.png",
    alt:    "Venusaur",
    name:   "Venusaur #15",
    set:    "Base Set — 1999",
    rarity: "Rare Holo",
    price:  "$750.00",
  },
];

// Transform per position: 0 = front, 1 = middle, 2 = back
const TRANSFORMS = [
  "rotate(0deg) translate(0px, 0px)",
  "rotate(6deg) translate(16px, 0px)",
  "rotate(12deg) translate(32px, 8px)",
];
const Z_INDICES = [30, 20, 10];

export function HeroCardStack() {
  const [frontIndex, setFrontIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setFrontIndex((prev) => (prev + 1) % 3);
    }, 3500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="hidden lg:flex items-center justify-center relative h-[540px]">
      {CARDS.map((card, i) => {
        const position = (i - frontIndex + 3) % 3;
        const isFront  = position === 0;

        return (
          <div
            key={card.id}
            className="absolute w-56 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            style={{
              transform:    TRANSFORMS[position],
              zIndex:       Z_INDICES[position],
              transition:   "transform 0.8s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.8s ease, opacity 0.8s ease",
              background:   "linear-gradient(135deg, #161d30 0%, #0f1424 100%)",
              padding:      "0.5rem",
              border:       `1px solid ${isFront ? "rgba(232,184,75,0.3)" : "rgb(30,36,64)"}`,
              opacity:      position === 2 ? 0.85 : 1,
            }}
          >
            <img
              src={card.src}
              alt={card.alt}
              className="w-full h-auto block rounded-xl mb-2"
            />
            <div
              style={{
                opacity:    isFront ? 1 : 0,
                transition: "opacity 0.5s ease",
                height:     isFront ? "auto" : 0,
                overflow:   "hidden",
              }}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-semibold text-gold uppercase tracking-widest">{card.rarity}</span>
                <span className="text-xs text-foreground-muted">★ PSA 10</span>
              </div>
              <p className="text-sm font-semibold text-foreground">{card.name}</p>
              <p className="text-xs text-foreground-muted">{card.set}</p>
              <p className="text-base font-bold text-gold">{card.price}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
