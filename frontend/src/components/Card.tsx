import type { ReactNode } from 'react'

export interface CardProps {
  title?:    ReactNode
  footer?:   ReactNode
  children:  ReactNode
  className?: string
}

export function Card({ title, footer, children, className = '' }: CardProps) {
  return (
    <div className={`card ${className}`.trim()}>
      {title  && <div className="card__header">{title}</div>}
      <div className="card__body">{children}</div>
      {footer && <div className="card__footer">{footer}</div>}
    </div>
  )
}
