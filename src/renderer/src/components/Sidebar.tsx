import type { ReactNode } from 'react'
import type { Collection, Folder, LibraryStats, ScanProgress, Tag } from '@shared/api'
import type { LibraryView, Selection } from '../types'
import { numberFormat } from '../format'

interface Props {
  stats: LibraryStats
  folders: Folder[]
  tags: Tag[]
  collections: Collection[]
  scans: Map<number, ScanProgress>
  selection: Selection
  onSelect(selection: Selection): void
  onAddFolder(): void
  onRemoveFolder(folder: Folder): void
  onRevealFolder(folder: Folder): void
  onRescanFolder(folder: Folder): void
}

const LIBRARY: { id: LibraryView; label: string; count: (s: LibraryStats) => number | null }[] = [
  { id: 'all', label: 'All files', count: (s) => s.files },
  { id: 'recent', label: 'Recent', count: () => null },
  { id: 'untagged', label: 'Untagged', count: (s) => s.untagged },
  { id: 'missing', label: 'Missing', count: (s) => s.missing }
]

function isSelected(selection: Selection, kind: Selection['kind'], id: string | number): boolean {
  return selection.kind === kind && selection.id === id
}

function folderLabel(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts.at(-1) ?? path
}

export default function Sidebar(props: Props) {
  const { stats, folders, tags, collections, selection, onSelect } = props

  return (
    <nav className="flex w-60 shrink-0 flex-col gap-5 overflow-y-auto border-r border-zinc-200 px-2 py-4 text-sm dark:border-zinc-800">
      <Section title="Library">
        {LIBRARY.map((item) => (
          <Item
            key={item.id}
            label={item.label}
            count={item.count(stats)}
            active={isSelected(selection, 'library', item.id)}
            onClick={() => onSelect({ kind: 'library', id: item.id })}
          />
        ))}
      </Section>

      <Section title="Collections" action={{ label: '+ New', disabled: true }}>
        {collections.length === 0 && <Empty>No collections yet</Empty>}
        {collections.map((c) => (
          <Item
            key={c.id}
            label={c.name}
            count={c.fileCount}
            active={isSelected(selection, 'collection', c.id)}
            onClick={() => onSelect({ kind: 'collection', id: c.id })}
          />
        ))}
      </Section>

      <Section title="Tags">
        {tags.length === 0 && <Empty>No tags yet</Empty>}
        {tags.map((t) => (
          <Item
            key={t.id}
            label={t.name}
            count={t.fileCount}
            dot={t.color}
            active={isSelected(selection, 'tag', t.id)}
            onClick={() => onSelect({ kind: 'tag', id: t.id })}
          />
        ))}
      </Section>

      <Section title="Folders" action={{ label: '+ Add', onClick: props.onAddFolder }}>
        {folders.length === 0 && <Empty>No folders added</Empty>}
        {folders.map((f) => {
          const scan = props.scans.get(f.id)
          return (
          <div key={f.id} className="group relative">
            <Item
              label={folderLabel(f.path)}
              title={f.offline ? `${f.path} (offline)` : f.path}
              count={f.fileCount}
              muted={f.offline}
              active={isSelected(selection, 'folder', f.id)}
              onClick={() => onSelect({ kind: 'folder', id: f.id })}
            />
            {scan && (
              <p className="px-2 pb-1 text-[11px] text-zinc-500" aria-live="polite">
                <span className="mr-1 inline-block size-1.5 animate-pulse rounded-full bg-accent" />
                Scanning… {numberFormat.format(scan.seen)} found
              </p>
            )}
            <div className="absolute top-1 right-1 hidden gap-1 group-hover:flex">
              <IconButton title="Rescan folder" onClick={() => props.onRescanFolder(f)}>
                ⟳
              </IconButton>
              <IconButton title="Open in Explorer" onClick={() => props.onRevealFolder(f)}>
                ↗
              </IconButton>
              <IconButton title="Remove from catalog" onClick={() => props.onRemoveFolder(f)}>
                ✕
              </IconButton>
            </div>
          </div>
          )
        })}
      </Section>
    </nav>
  )
}

function Section(props: {
  title: string
  action?: { label: string; onClick?(): void; disabled?: boolean }
  children: ReactNode
}) {
  return (
    <section>
      <header className="mb-1 flex items-center justify-between px-2">
        <h2 className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">
          {props.title}
        </h2>
        {props.action && (
          <button
            type="button"
            onClick={props.action.onClick}
            disabled={props.action.disabled}
            className="text-xs text-zinc-500 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-zinc-500"
          >
            {props.action.label}
          </button>
        )}
      </header>
      <ul className="flex flex-col">{props.children}</ul>
    </section>
  )
}

function Item(props: {
  label: string
  title?: string
  count: number | null
  active: boolean
  dot?: string
  muted?: boolean
  onClick(): void
}) {
  return (
    <li>
      <button
        type="button"
        title={props.title}
        onClick={props.onClick}
        className={[
          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left',
          props.active
            ? 'bg-accent/15 font-medium text-accent'
            : 'hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60',
          props.muted ? 'opacity-50' : ''
        ].join(' ')}
      >
        {props.dot && (
          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: props.dot }} />
        )}
        <span className="min-w-0 flex-1 truncate">{props.label}</span>
        {props.count !== null && (
          <span className="text-xs text-zinc-500 tabular-nums group-hover:invisible">
            {props.count}
          </span>
        )}
      </button>
    </li>
  )
}

function IconButton(props: { title: string; onClick(): void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={props.title}
      aria-label={props.title}
      onClick={props.onClick}
      className="grid size-6 place-items-center rounded text-xs text-zinc-500 hover:bg-zinc-300 hover:text-zinc-900 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
    >
      {props.children}
    </button>
  )
}

function Empty(props: { children: ReactNode }) {
  return <li className="px-2 py-1 text-xs text-zinc-400 italic">{props.children}</li>
}
