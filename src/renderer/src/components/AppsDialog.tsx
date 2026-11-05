import { useState } from 'react'
import type { AppsState } from '@shared/api'
import { handles, OPEN_TYPES } from '../apps'
import Dialog, { DialogButton } from './Dialog'

// Programs files can be opened with, and which one each type opens in by default.
export default function AppsDialog(props: { state: AppsState; onChange(state: AppsState): void; onClose(): void }) {
  const { state, onChange } = props
  const [message, setMessage] = useState<string | null>(null)
  const [detecting, setDetecting] = useState(false)

  const add = async () => {
    const result = await window.api.apps.pickAndAdd()
    if (result.ok) {
      onChange(result.state)
      setMessage(null)
    } else if (result.reason !== 'cancelled') {
      setMessage(result.message)
    }
  }

  const detect = async () => {
    setDetecting(true)
    try {
      const before = state.apps.length
      const next = await window.api.apps.detect()
      onChange(next)
      const found = next.apps.filter((a) => a.autoDetected).length
      setMessage(
        next.apps.length > before
          ? `Found ${next.apps.length - before} new ${next.apps.length - before === 1 ? 'program' : 'programs'}.`
          : `No new programs found (${found} detected).`
      )
    } finally {
      setDetecting(false)
    }
  }

  return (
    <Dialog
      title="Open with"
      onClose={props.onClose}
      className="w-[34rem]"
      footer={
        <DialogButton kind="primary" onClick={props.onClose} autoFocus>
          Done
        </DialogButton>
      }
    >
      <h3 className="text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">Default for each type</h3>
      <div className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2">
        {OPEN_TYPES.map((t) => (
          <label key={t.ext} className="contents">
            <span>{t.label}</span>
            <select
              value={state.defaults[t.ext] ?? ''}
              onChange={async (e) =>
                onChange(await window.api.apps.setDefault(t.ext, e.target.value === '' ? null : Number(e.target.value)))
              }
              className="h-8 rounded-md border border-zinc-300 bg-white px-2 outline-none focus:border-accent dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">Windows default program</option>
              {state.apps
                .filter((a) => handles(a, t.ext))
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </label>
        ))}
      </div>

      <h3 className="mt-5 text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">Programs</h3>
      {state.apps.length === 0 ? (
        <p className="mt-2 text-zinc-500">
          No slicers were found in the usual install folders. Add one by picking its .exe file.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-zinc-200 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {state.apps.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{a.name}</p>
                <p className="truncate text-[11px] text-zinc-500" title={a.exePath}>
                  {a.exePath}
                </p>
              </div>
              {a.exts && <span className="text-[11px] text-zinc-500">{a.exts.join(', ')} only</span>}
              {a.autoDetected ? (
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800">
                  Detected
                </span>
              ) : (
                <button
                  type="button"
                  onClick={async () => onChange(await window.api.apps.remove(a.id))}
                  className="text-[11px] text-zinc-500 hover:text-red-600 dark:hover:text-red-400"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex items-center gap-2">
        <DialogButton onClick={add}>Add program…</DialogButton>
        <DialogButton onClick={detect} disabled={detecting}>
          {detecting ? 'Looking…' : 'Detect again'}
        </DialogButton>
        {message && <span className="text-zinc-500">{message}</span>}
      </div>
    </Dialog>
  )
}
