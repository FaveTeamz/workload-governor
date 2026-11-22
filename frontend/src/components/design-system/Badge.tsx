import type { ReactNode } from "react";

export type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "info";

export interface BadgeProps {
  /** Status-driven colour variant */
  variant?: BadgeVariant;
  children: ReactNode;
  /** Optional accessible label to supplement the visual */
  "aria-label"?: string;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default: "badge-default",
  success: "badge-success",
  warning: "badge-warning",
  danger: "badge-danger",
  info: "badge-info",
};

/**
 * Design-system Badge.
 * Small inline label conveying status. Five variants: default, success,
 * warning, danger, info.
 */
export function Badge({
  variant = "default",
  children,
  "aria-label": ariaLabel,
}: BadgeProps) {
  return (
    <span
      className={`badge ${VARIANT_CLASSES[variant]}`}
      aria-label={ariaLabel}
    >
      {children}
    </span>
  );
}
