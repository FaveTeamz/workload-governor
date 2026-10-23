import { Modal } from './Modal'
import type { ShortcutHandler } from '../hooks/useKeyboardShortcuts'

export interface KeyboardShortcutsModalProps {
  open: boolean
  onClose: () => void
  shortcuts: ShortcutHandler[]
}

/**
 * KeyboardShortcutsModal
 *
 * Renders a help modal listing all registered keyboard shortcuts in a table.
 * Opened by pressing '?' anywhere in the app.
 */
export function KeyboardShortcutsModal({ open, onClose, shortcuts }: KeyboardShortcutsModalProps) {
  return (
    <Modal open={open} title="Keyboard Shortcuts" onClose={onClose}>
      <table className="table shortcuts-table" aria-label="Keyboard shortcuts">
        <thead>
          <tr>
            <th scope="col">Key</th>
            <th scope="col">Action</th>
          </tr>
        </thead>
        <tbody>
          {shortcuts.map((s) => (
            <tr key={s.key}>
              <td>
                <kbd className="kbd">{s.key === 'Escape' ? 'Esc' : s.key}</kbd>
              </td>
              <td>{s.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  )
}
