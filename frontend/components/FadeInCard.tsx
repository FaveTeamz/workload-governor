import type { ReactNode } from "react";

export default function FadeInCard({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`fade-in ${className}`} style={style}>
      {children}
    </div>
  );
}
