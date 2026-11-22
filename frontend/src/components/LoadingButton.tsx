import type { ButtonHTMLAttributes, MouseEventHandler, ReactNode } from "react";

interface LoadingButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  loadingText?: string;
  children: ReactNode;
}

export default function LoadingButton({
  isLoading,
  loadingText = "Loading...",
  children,
  disabled,
  onClick,
  style,
  type = "button",
  ...props
}: LoadingButtonProps) {
  const loading = isLoading ?? false;

  const handleClick: MouseEventHandler<HTMLButtonElement> = (event) => {
    if (loading) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };

  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading}
      aria-disabled={disabled || loading}
      onClick={handleClick}
      style={{ minWidth: 150, justifyContent: "center", ...style }}
      {...props}
    >
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        {loading && <span className="spinner" aria-hidden="true" />}
        <span>{loading ? loadingText : children}</span>
      </span>
    </button>
  );
}
