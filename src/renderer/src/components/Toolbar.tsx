import type { RefObject } from 'react'
import type { FileType, SortKey, ViewMode } from '../types'

interface Props {
  searchRef: RefObject<HTMLInputElement | null>
  query: string
  onQueryChange(query: string): void
  types: Set<FileType>
  onTypesChange(types: Set<FileType>): void
  sort: SortKey
  desc: boolean
  onSortChange(sort: SortKey, desc: boolean): void
  viewMode: ViewMode
  onViewModeChange(mode: ViewMode): void
  onManageApps(): void
  onOpenSettings(): void
}

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'name', label: 'Name' },
  { id: 'mtime', label: 'Date modified' },
  { id: 'size', label: 'Size' },
  { id: 'type', label: 'Type' }
]

const TYPES: { id: FileType; label: string }[] = [
  { id: 'stl', label: 'STL' },
  { id: '3mf', label: '3MF' },
  { id: 'gcode', label: 'G-code' }
]

export default function Toolbar(props: Props) {
  const toggleType = (id: FileType) => {
    const next = new Set(props.types)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    props.onTypesChange(next)
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-zinc-200 px-4 dark:border-zinc-800">
      <div className="flex w-56 items-center gap-2">
        <span className="grid size-7 place-items-center rounded-md bg-accent text-xs font-bold text-white">
          3FM
        </span>
        <span className="text-sm font-semibold">3D Files Manager</span>
      </div>

      <input
        ref={props.searchRef}
        type="search"
        value={props.query}
        onChange={(e) => props.onQueryChange(e.target.value)}
        placeholder='Search files…  e.g. benchy tag:pla type:3mf in:"Gifts"'
        className="h-9 max-w-xl flex-1 rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none placeholder:text-zinc-400 focus:border-accent dark:border-zinc-700 dark:bg-zinc-900"
      />

      <div className="flex gap-1" role="group" aria-label="File type filter">
        {TYPES.map((t) => {
          const on = props.types.has(t.id)
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggleType(t.id)}
              className={[
                'h-8 rounded-md border px-3 text-xs font-medium',
                on
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-zinc-300 text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-400'
              ].join(' ')}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      <div className="ml-auto flex items-center gap-1">
        <label htmlFor="sort" className="text-xs text-zinc-500">
          Sort
        </label>
        <select
          id="sort"
          value={props.sort}
          onChange={(e) => {
            const sort = e.target.value as SortKey
            // Newest and largest first are the useful defaults.
            props.onSortChange(sort, sort === 'mtime' || sort === 'size')
          }}
          className="h-8 rounded-md border border-zinc-300 bg-white px-2 text-xs outline-none focus:border-accent dark:border-zinc-700 dark:bg-zinc-900"
        >
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          title={props.desc ? 'Descending' : 'Ascending'}
          aria-label={props.desc ? 'Sort descending' : 'Sort ascending'}
          onClick={() => props.onSortChange(props.sort, !props.desc)}
          className="grid size-8 place-items-center rounded-md border border-zinc-300 text-xs text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-400"
        >
          {props.desc ? '↓' : '↑'}
        </button>
      </div>

      <div className="flex overflow-hidden rounded-md border border-zinc-300 dark:border-zinc-700">
        {(['grid', 'list'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={props.viewMode === mode}
            onClick={() => props.onViewModeChange(mode)}
            className={[
              'h-8 px-3 text-xs capitalize',
              props.viewMode === mode
                ? 'bg-zinc-200 font-medium dark:bg-zinc-800'
                : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900'
            ].join(' ')}
          >
            {mode}
          </button>
        ))}
      </div>

      <button
        type="button"
        title="Programs files open with"
        onClick={props.onManageApps}
        className="h-8 rounded-md border border-zinc-300 px-3 text-xs text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-400"
      >
        Apps
      </button>

      <button
        type="button"
        title="Settings (Ctrl+,)"
        aria-label="Settings"
        onClick={props.onOpenSettings}
        className="-ml-2 grid size-8 place-items-center rounded-md border border-zinc-300 text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-400"
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
        </svg>
      </button>
    </header>
  )
}
