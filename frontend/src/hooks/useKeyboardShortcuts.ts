import { useEffect } from 'react'

export interface ShortcutHandler {
  /** The key to listen for (e.g. '?', '/', 'Escape', 'n') */
  key: string
  /** Human-readable description shown in the help modal */
  description: string
  /** Called when the shortcut fires */
  handler: () => void
}

/**
 * useKeyboardShortcuts
 *
 * Registers global keydown listeners for an array of shortcut definitions.
 * Shortcuts are intentionally suppressed when focus is inside a text input,
 * textarea, select, or any contenteditable element to avoid conflicts while typing.
 *
 * @param shortcuts - Array of shortcut definitions (key + handler).
 * @param enabled   - When false, all handlers are disabled (e.g. while a modal is
 *                    open and managing its own keyboard events). Defaults to true.
 */
export function useKeyboardShortcuts(
  shortcuts: ShortcutHandler[],
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return

    function handleKeyDown(e: KeyboardEvent) {
      // Ignore when the user is typing inside a form control or rich-text editor
      const target = e.target as HTMLElement
      const tagName = target?.tagName?.toLowerCase()
      if (
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select' ||
        target?.isContentEditable
      ) {
        return
      }

      // Don't fire when modifier keys are held (Ctrl/Meta combos are browser shortcuts)
      if (e.ctrlKey || e.metaKey || e.altKey) return

      for (const shortcut of shortcuts) {
        if (e.key === shortcut.key) {
          e.preventDefault()
          shortcut.handler()
          return
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [shortcuts, enabled])
}
