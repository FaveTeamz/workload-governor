/**
 * Tooltip — closes #323
 *
 * Contextual tooltip with accessible markup, keyboard dismissal,
 * viewport-edge flip, and mobile tap support.
 */
import {
  useId,
  useRef,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import "./Tooltip.css";

export type TooltipPosition = "top" | "bottom" | "left" | "right";

export interface TooltipProps {
  /** The tooltip text. */
  content: string;
  children: ReactNode;
  /** Preferred position. Auto-flips if near a viewport edge. */
  position?: TooltipPosition;
}

const FLIP: Record<TooltipPosition, TooltipPosition> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
};

export function Tooltip({ content, children, position = "top" }: TooltipProps) {
  const id = useId();
  const tooltipId = `tooltip-${id.replace(/:/g, "")}`;
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const bubbleRef  = useRef<HTMLSpanElement>(null);
  const [visible, setVisible]       = useState(false);
  const [resolvedPos, setResolvedPos] = useState<TooltipPosition>(position);

  // Recompute position to avoid viewport edge clipping
  const computePosition = useCallback(() => {
    const wrapper = wrapperRef.current;
    const bubble  = bubbleRef.current;
    if (!wrapper || !bubble) return;

    const wRect = wrapper.getBoundingClientRect();
    const bRect = bubble.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const MARGIN = 8;

    let best = position;

    if (position === "top"    && wRect.top - bRect.height - MARGIN < 0)     best = FLIP[position];
    if (position === "bottom" && wRect.bottom + bRect.height + MARGIN > vh)  best = FLIP[position];
    if (position === "left"   && wRect.left - bRect.width - MARGIN < 0)      best = FLIP[position];
    if (position === "right"  && wRect.right + bRect.width + MARGIN > vw)    best = FLIP[position];

    setResolvedPos(best);
  }, [position]);

  const show = useCallback(() => {
    setVisible(true);
    requestAnimationFrame(computePosition);
  }, [computePosition]);

  const hide = useCallback(() => setVisible(false), []);

  // Escape key dismissal
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [visible, hide]);

  // Outside-tap dismissal for mobile
  useEffect(() => {
    if (!visible) return;
    const onTouch = (e: TouchEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) hide();
    };
    document.addEventListener("touchstart", onTouch);
    return () => document.removeEventListener("touchstart", onTouch);
  }, [visible, hide]);

  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    visible ? hide() : show();
  };

  return (
    <span
      ref={wrapperRef}
      className={`tooltip-wrapper${visible ? " tooltip-wrapper--visible" : ""}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusCapture={show}
      onBlurCapture={hide}
      onTouchStart={handleTouchStart}
    >
      {children}
      <span
        ref={bubbleRef}
        id={tooltipId}
        role="tooltip"
        className={`tooltip__bubble tooltip__bubble--${resolvedPos}`}
        aria-hidden={!visible}
      >
        {content}
      </span>
    </span>
  );
}
