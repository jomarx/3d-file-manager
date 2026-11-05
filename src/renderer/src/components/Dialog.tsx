import { useEffect, useId, type ReactNode } from 'react'

// Modal dialog. Escape and the backdrop close it.
export default function Dialog(props: {
  title: string
  onClose(): void
  children: ReactNode
  footer: ReactNode
  className?: string
}) {
  const titleId = useId()
  const { onClose } = props

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-6" onPointerDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onPointerDown={(e) => e.stopPropagation()}
        className={`flex max-h-full flex-col rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-[#15181e] ${props.className ?? 'w-[28rem]'}`}
      >
        <h2 id={titleId} className="px-5 pt-5 text-sm font-semibold">
          {props.title}
        </h2>
        <div className="min-h-0 overflow-y-auto px-5 pt-3 pb-5 text-xs">{props.children}</div>
        <footer className="flex justify-end gap-2 border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">
          {props.footer}
        </footer>
      </div>
    </div>
  )
}

export function DialogButton(props: {
  children: ReactNode
  onClick(): void
  kind?: 'primary' | 'danger' | 'plain'
  disabled?: boolean
  autoFocus?: boolean
}) {
  const kind = props.kind ?? 'plain'
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      autoFocus={props.autoFocus}
      className={[
        'h-8 rounded-md px-3 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-40',
        kind === 'primary'
          ? 'bg-accent text-white hover:brightness-110'
          : kind === 'danger'
            ? 'bg-red-600 text-white hover:bg-red-500'
            : 'border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800'
      ].join(' ')}
    >
      {props.children}
    </button>
  )
}
