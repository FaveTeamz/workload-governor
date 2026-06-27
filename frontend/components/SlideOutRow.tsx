"use client";
import { useState, type ReactNode } from "react";

export default function SlideOutRow({
  children,
  onRemoved,
}: {
  children: ReactNode;
  onRemoved?: () => void;
}) {
  const [sliding, setSliding] = useState(false);

  function withdraw() {
    setSliding(true);
  }

  return (
    <div
      className={sliding ? "slide-out" : ""}
      onAnimationEnd={sliding ? onRemoved : undefined}
    >
      {typeof children === "function"
        ? (children as (withdraw: () => void) => ReactNode)(withdraw)
        : children}
    </div>
  );
}
