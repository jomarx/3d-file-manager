import { useEffect, useState, type ReactNode } from 'react'
import type { AppInfo, Theme } from '@shared/api'
import Dialog, { DialogButton } from './Dialog'

const THEMES: { id: Theme; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' }
]

const SHORTCUTS: [string, string][] = [
  ['Ctrl+F', 'Search'],
  ['Arrow keys', 'Move the selection'],
  ['Shift+Arrow keys', 'Extend the selection'],
  ['Home / End', 'First / last file'],
  ['Ctrl+A', 'Select all'],
  ['Enter', 'Open in the default app'],
  ['F2', 'Rename'],
  ['Delete', 'Move to the Recycle Bin'],
  ['Escape', 'Clear the selection or close a dialog'],
  ['Ctrl+,', 'Settings']
]

export default function SettingsDialog(props: { theme: Theme; onThemeChange(theme: Theme): void; onClose(): void }) {
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    void window.api.app.info().then(setInfo)
  }, [])

  return (
    <Dialog
      title="Settings"
      onClose={props.onClose}
      className="w-[32rem]"
      footer={
        <DialogButton kind="primary" onClick={props.onClose} autoFocus>
          Done
        </DialogButton>
      }
    >
      <Section title="Appearance">
        <div className="flex items-center justify-between">
          <span>Theme</span>
          <div className="flex overflow-hidden rounded-md border border-zinc-300 dark:border-zinc-700" role="radiogroup">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={props.theme === t.id}
                onClick={() => props.onThemeChange(t.id)}
                className={[
                  'h-7 px-3',
                  props.theme === t.id
                    ? 'bg-zinc-200 font-medium dark:bg-zinc-800'
                    : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900'
                ].join(' ')}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Keyboard shortcuts">
        <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1.5">
          {SHORTCUTS.map(([keys, action]) => (
            <div key={keys} className="contents">
              <dt>
                <kbd className="rounded border border-zinc-300 bg-zinc-50 px-1.5 py-px font-sans text-[11px] dark:border-zinc-700 dark:bg-zinc-900">
                  {keys}
                </kbd>
              </dt>
              <dd className="text-zinc-600 dark:text-zinc-400">{action}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="About">
        {info && (
          <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1.5">
            <dt className="text-zinc-500">Version</dt>
            <dd>
              {info.name} {info.version}
            </dd>
            <dt className="text-zinc-500">Catalog</dt>
            <dd className="break-all select-text">{info.dbPath}</dd>
            <dt className="text-zinc-500">Catalog format</dt>
            <dd>v{info.schemaVersion}</dd>
          </dl>
        )}
        <p className="mt-3 text-zinc-500">
          Everything stays on this computer. 3FM never uploads your files or catalog.
        </p>
        <button
          type="button"
          onClick={() => void window.api.app.showDataFolder()}
          className="mt-3 h-7 rounded-md border border-zinc-300 px-3 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Open data folder
        </button>
      </Section>
    </Dialog>
  )
}

function Section(props: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-zinc-200 py-4 first:border-t-0 first:pt-1 last:pb-0 dark:border-zinc-800">
      <h3 className="mb-3 text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">{props.title}</h3>
      {props.children}
    </section>
  )
}
