import type { ButtonHTMLAttributes, ReactNode } from "react";

export default function LoadingButton({
  loading,
  children,
  ...props
}: { loading?: boolean; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button disabled={loading} aria-busy={loading} {...props}>
      {loading && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}
