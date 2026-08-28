"use client";
import { useEffect, useState, type ReactNode } from "react";

export default function SlideOutRow({
  children,
  isRemoved = false,
  onRemoved,
}: {
  children: ReactNode;
  isRemoved?: boolean;
  onRemoved?: () => void;
}) {
  const [sliding, setSliding] = useState(false);
  const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (!isRemoved) return;

    if (prefersReducedMotion) {
      onRemoved?.();
      return;
    }

    setSliding(true);
  }, [isRemoved, onRemoved, prefersReducedMotion]);

  if (isRemoved && prefersReducedMotion) {
    return null;
  }

  return (
    <div
      className={sliding ? "slide-out" : ""}
      onAnimationEnd={() => {
        if (sliding) onRemoved?.();
      }}
    >
      {children}
    </div>
  );
}
