import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export type MenuEntry =
  | {
      label: string
      hint?: string
      disabled?: boolean
      bold?: boolean
      danger?: boolean
      onSelect(): void
    }
  | { separator: true }
  | { heading: string }

export interface MenuAt {
  x: number
  y: number
  entries: MenuEntry[]
}

// Popup menu at a point, used for right-click and drop-down buttons. Closes on
// Escape, a click outside, scrolling or the window losing focus.
export default function Menu({ at, onClose }: { at: MenuAt; onClose(): void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: at.x, top: at.y })

  // Keep the menu on screen: flip left/up when it would overflow.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const left = at.x + width > window.innerWidth - 4 ? Math.max(4, at.x - width) : at.x
    const top = at.y + height > window.innerHeight - 4 ? Math.max(4, at.y - height) : at.y
    setPos({ left, top })
    el.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [at])

  useEffect(() => {
    const outside = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    // Capture phase, so the app's own shortcuts don't also fire while the menu is open.
    const onKey = (e: KeyboardEvent) => {
      e.stopImmediatePropagation()
      if (e.key === 'Escape' || e.key === 'Tab') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const next = e.key === 'ArrowDown' ? i + 1 : i - 1
        buttons[(next + buttons.length) % buttons.length]?.focus()
      }
    }
    window.addEventListener('pointerdown', outside, true)
    window.addEventListener('wheel', outside, true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('blur', onClose)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('wheel', outside, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      role="menu"
      style={pos}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-50 min-w-56 rounded-md border border-zinc-200 bg-white py-1 text-xs shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
    >
      {at.entries.map((entry, i) =>
        'separator' in entry ? (
          <hr key={i} className="my-1 border-zinc-200 dark:border-zinc-800" />
        ) : 'heading' in entry ? (
          <p key={i} className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold tracking-wide text-zinc-400 uppercase">
            {entry.heading}
          </p>
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            disabled={entry.disabled}
            onMouseEnter={(e) => e.currentTarget.focus()}
            onClick={() => {
              onClose()
              entry.onSelect()
            }}
            className={[
              'flex w-full items-center gap-6 px-3 py-1.5 text-left outline-none disabled:opacity-40',
              'focus:bg-accent focus:text-white',
              entry.bold ? 'font-semibold' : '',
              entry.danger ? 'text-red-600 dark:text-red-400' : ''
            ].join(' ')}
          >
            <span className="flex-1">{entry.label}</span>
            {entry.hint && <span className="text-[11px] opacity-60">{entry.hint}</span>}
          </button>
        )
      )}
    </div>
  )
}
