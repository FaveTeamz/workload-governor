"use client";
import { useEffect, useState, type ReactNode } from "react";
import "./SlideOutRow.css";

export default function SlideOutRow({
  children,
  isRemoved = false,
  onRemoved,
  className = "",
}: {
  children: ReactNode;
  isRemoved?: boolean;
  onRemoved?: () => void;
  className?: string;
}) {
  const [sliding, setSliding] = useState(false);
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

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
      data-testid="slide-out-row-container"
      className={`slide-out-row-container ${className}`.trim()}
      style={{ overflowX: "hidden" }}
    >
      <div
        data-testid="slide-out-row-content"
        className={sliding ? "slide-out" : ""}
        style={sliding ? { willChange: "transform, opacity" } : undefined}
        onAnimationEnd={() => {
          if (sliding) onRemoved?.();
        }}
      >
        {children}
      </div>
    </div>
  );
}
