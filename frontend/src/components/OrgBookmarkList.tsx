import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useId,
  type DragEvent,
  type KeyboardEvent,
} from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrgItem {
  id: string
  label: string
}

interface OrgBookmarkListProps {
  /** List of orgs to display */
  orgs: OrgItem[]
  /** Wallet address used to key the persisted order in localStorage */
  walletAddress?: string | null
  /** Called when the user selects an org */
  onSelect?: (org: OrgItem) => void
}

// ─── localStorage helpers ────────────────────────────────────────────────────

const PINNED_KEY = (wallet: string) => `wg:pinned:${wallet}`
const ORDER_KEY  = (wallet: string) => `wg:orgOrder:${wallet}`
const MAX_PINS   = 3

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage quota exceeded — silently ignore
  }
}

// ─── Sort helpers ─────────────────────────────────────────────────────────────

function applyOrder(orgs: OrgItem[], order: string[]): OrgItem[] {
  const orderMap = new Map(order.map((id, i) => [id, i]))
  return [...orgs].sort((a, b) => {
    const ai = orderMap.get(a.id) ?? orgs.findIndex(o => o.id === a.id)
    const bi = orderMap.get(b.id) ?? orgs.findIndex(o => o.id === b.id)
    return ai - bi
  })
}

function floatPinned(sorted: OrgItem[], pinned: Set<string>): OrgItem[] {
  const pinnedItems   = sorted.filter(o => pinned.has(o.id))
  const unpinnedItems = sorted.filter(o => !pinned.has(o.id))
  return [...pinnedItems, ...unpinnedItems]
}

// ─── OrgBookmarkList ─────────────────────────────────────────────────────────

export function OrgBookmarkList({ orgs, walletAddress, onSelect }: OrgBookmarkListProps) {
  const storageKey = walletAddress ?? '__guest__'

  // Persisted order (array of org ids)
  const [order,   setOrder  ] = useState<string[]>(() => readJson(ORDER_KEY(storageKey), []))
  // Pinned org ids (up to MAX_PINS)
  const [pinned,  setPinned ] = useState<Set<string>>(
    () => new Set(readJson<string[]>(PINNED_KEY(storageKey), []))
  )

  // Derived sorted + pinned-floated list
  const sorted = floatPinned(applyOrder(orgs, order), pinned)

  // Persist whenever order or pins change
  useEffect(() => { writeJson(ORDER_KEY(storageKey),  order)         }, [order,  storageKey])
  useEffect(() => { writeJson(PINNED_KEY(storageKey), [...pinned])   }, [pinned, storageKey])

  // ── DnD state ──────────────────────────────────────────────────────────────
  const dragId  = useRef<string | null>(null)
  const overId  = useRef<string | null>(null)

  const handleDragStart = useCallback((e: DragEvent<HTMLLIElement>, id: string) => {
    dragId.current = id
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
    ;(e.currentTarget as HTMLLIElement).classList.add('org-item--dragging')
  }, [])

  const handleDragOver = useCallback((e: DragEvent<HTMLLIElement>, id: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    overId.current = id
  }, [])

  const handleDrop = useCallback((e: DragEvent<HTMLLIElement>) => {
    e.preventDefault()
    const from = dragId.current
    const to   = overId.current
    if (!from || !to || from === to) return

    setOrder(prev => {
      const ids = sorted.map(o => o.id)
      // Start from current visual order (which incorporates prev persisted order)
      const current = ids.length ? ids : orgs.map(o => o.id)
      const base = [...new Set([...current, ...prev])]
        .filter(id => orgs.some(o => o.id === id))

      const fromIdx = base.indexOf(from)
      const toIdx   = base.indexOf(to)
      if (fromIdx === -1 || toIdx === -1) return prev

      const next = [...base]
      next.splice(fromIdx, 1)
      next.splice(toIdx, 0, from)
      return next
    })
    dragId.current = null
    overId.current = null
  }, [sorted, orgs])

  const handleDragEnd = useCallback((e: DragEvent<HTMLLIElement>) => {
    ;(e.currentTarget as HTMLLIElement).classList.remove('org-item--dragging')
    dragId.current = null
  }, [])

  // ── Keyboard reorder ───────────────────────────────────────────────────────
  const handleHandleKeyDown = useCallback((e: KeyboardEvent<HTMLSpanElement>, id: string) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault()

    setOrder(prev => {
      const ids = sorted.map(o => o.id)
      const base = [...new Set([...ids, ...prev])].filter(id => orgs.some(o => o.id === id))
      const idx = base.indexOf(id)
      if (idx === -1) return prev

      const next = [...base]
      if (e.key === 'ArrowUp'   && idx > 0)              { [next[idx], next[idx - 1]] = [next[idx - 1], next[idx]] }
      if (e.key === 'ArrowDown' && idx < next.length - 1) { [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]] }
      return next
    })
  }, [sorted, orgs])

  // ── Pin toggle ─────────────────────────────────────────────────────────────
  const togglePin = useCallback((id: string) => {
    setPinned(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else if (next.size < MAX_PINS) {
        next.add(id)
      }
      return next
    })
  }, [])

  // ── Reset ─────────────────────────────────────────────────────────────────
  const resetOrder = useCallback(() => {
    setOrder([])
    setPinned(new Set())
  }, [])

  const headingId = useId()

  return (
    <nav className="org-sidebar" aria-labelledby={headingId}>
      <div className="org-sidebar__header">
        <h2 className="org-sidebar__heading" id={headingId}>Organisations</h2>
      </div>

      <ul
        className="org-list"
        role="listbox"
        aria-label="Organisation bookmarks"
      >
        {sorted.map((org) => {
          const isPinned  = pinned.has(org.id)
          const atPinCap  = !isPinned && pinned.size >= MAX_PINS

          return (
            <li
              key={org.id}
              className={`org-list__item${isPinned ? ' org-list__item--pinned' : ''}`}
              draggable
              onDragStart={(e) => handleDragStart(e, org.id)}
              onDragOver={(e)  => handleDragOver(e, org.id)}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
              role="option"
              aria-selected={false}
            >
              {/* Drag handle */}
              <span
                className="org-item__handle"
                aria-label={`Drag to reorder ${org.label}. Use arrow keys to move.`}
                tabIndex={0}
                role="button"
                onKeyDown={(e) => handleHandleKeyDown(e, org.id)}
                aria-describedby={`org-handle-hint`}
              >
                ⠿
              </span>

              {/* Org label button */}
              <button
                className="org-item__label"
                onClick={() => onSelect?.(org)}
                aria-label={`Open ${org.label}`}
              >
                {org.label}
              </button>

              {/* Pin / star toggle */}
              <button
                className={`org-item__pin${isPinned ? ' org-item__pin--active' : ''}`}
                onClick={() => togglePin(org.id)}
                aria-label={isPinned
                  ? `Unpin ${org.label}`
                  : atPinCap
                    ? `Cannot pin ${org.label}: maximum ${MAX_PINS} pinned orgs reached`
                    : `Pin ${org.label}`
                }
                aria-pressed={isPinned}
                disabled={atPinCap}
                title={isPinned ? 'Pinned' : atPinCap ? 'Pin limit reached (3)' : 'Pin to top'}
              >
                ★
              </button>
            </li>
          )
        })}
      </ul>

      {/* Visually-hidden hint for screen readers about keyboard reorder */}
      <span id="org-handle-hint" className="sr-only">
        Use arrow keys to move this organisation up or down the list.
      </span>

      {/* Footer: Reset order */}
      <div className="org-sidebar__footer">
        <button
          className="btn btn-ghost btn-sm org-sidebar__reset"
          onClick={resetOrder}
          aria-label="Reset organisation order and pins to defaults"
        >
          Reset order
        </button>
      </div>
    </nav>
  )
}
