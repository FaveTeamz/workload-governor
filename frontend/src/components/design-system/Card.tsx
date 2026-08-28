import type { ReactNode } from "react";

export interface CardProps {
  /** Card heading */
  title?: ReactNode;
  /** Optional sub-heading or meta text */
  subtitle?: ReactNode;
  /** Main content */
  children?: ReactNode;
  /** Footer slot — typically actions */
  footer?: ReactNode;
  /** Additional class names */
  className?: string;
}

/**
 * Design-system Card.
 * Surfaces a titled content block with optional subtitle and footer.
 */
export function Card({
  title,
  subtitle,
  children,
  footer,
  className = "",
}: CardProps) {
  return (
    <div className={`card ${className}`.trim()}>
      {(title || subtitle) && (
        <div className="card-header">
          {title && <h3 className="card-title">{title}</h3>}
          {subtitle && <p className="card-subtitle">{subtitle}</p>}
        </div>
      )}
      {children && <div className="card-body">{children}</div>}
      {footer && <div className="card-footer">{footer}</div>}
    </div>
  );
}
