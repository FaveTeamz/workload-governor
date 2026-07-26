import { useEffect, useRef, type ReactNode } from 'react'

export interface ModalProps {
  open:        boolean
  title:       string
  onClose:     () => void
  children:    ReactNode
  footer?:     ReactNode
}

export function Modal({ open, title, onClose, children, footer }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (open) el.showModal()
    else      el.close()
  }, [open])

  // close on backdrop click
  function handleClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      aria-labelledby="modal-title"
      onClick={handleClick}
      onKeyDown={e => e.key === 'Escape' && onClose()}
    >
      <div className="modal__content">
        <div className="modal__header">
          <h2 id="modal-title" className="modal__title">{title}</h2>
          <button className="modal__close" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__footer">{footer}</div>}
      </div>
    </dialog>
  )
}
