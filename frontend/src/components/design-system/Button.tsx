import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style variant */
  variant?: ButtonVariant;
  /** Size preset */
  size?: ButtonSize;
  /** Show a loading spinner and disable interaction */
  loading?: boolean;
  /** Icon placed before the label */
  iconStart?: ReactNode;
  /** Icon placed after the label */
  iconEnd?: ReactNode;
  children: ReactNode;
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "btn-sm",
  md: "",
  lg: "btn-lg",
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
};

/**
 * Design-system Button.
 * Covers primary, secondary, and ghost variants at sm/md/lg sizes.
 */
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  iconStart,
  iconEnd,
  disabled,
  children,
  className = "",
  ...rest
}: ButtonProps) {
  const classes = [
    "btn",
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <span className="btn-spinner" aria-hidden="true" />
      ) : (
        iconStart && <span className="btn-icon-start" aria-hidden="true">{iconStart}</span>
      )}
      <span>{children}</span>
      {!loading && iconEnd && (
        <span className="btn-icon-end" aria-hidden="true">{iconEnd}</span>
      )}
    </button>
  );
}
