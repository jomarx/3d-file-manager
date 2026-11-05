import { useEffect, useRef, type MouseEvent } from 'react'
import type { FileItem, SortKey } from '@shared/api'
import type { ViewMode } from '../types'
import { formatBytes, formatDate, TYPE_LABEL, TYPE_STYLE, dirname } from '../format'
import Highlight from './Highlight'

interface Props {
  hasFolders: boolean
  scanning: boolean
  items: FileItem[]
  total: number
  terms: string[]
  filtered: boolean
  viewMode: ViewMode
  sort: SortKey
  desc: boolean
  onSort(sort: SortKey, desc: boolean): void
  selected: Set<number>
  onItemClick(item: FileItem, event: MouseEvent): void
  onClearSelection(): void
  onLoadMore(): void
  onAddFolder(): void
}

export default function FileArea(props: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const { onLoadMore } = props

  // Load the next page when the bottom of the list comes into view.
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onLoadMore()
      },
      { root: scrollRef.current, rootMargin: '400px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [onLoadMore, props.items.length])

  if (!props.hasFolders) {
    return (
      <main className="flex min-w-0 flex-1 items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <p className="text-base font-semibold">Start your catalog</p>
          <p className="mt-2 text-sm text-zinc-500">
            Add a folder that holds your STL, 3MF or G-code files. 3FM indexes them without moving
            or changing anything.
          </p>
          <button
            type="button"
            onClick={props.onAddFolder}
            className="mt-4 h-9 rounded-md bg-accent px-4 text-sm font-medium text-white hover:brightness-110"
          >
            Add folder
          </button>
        </div>
      </main>
    )
  }

  if (props.total === 0) {
    return (
      <main className="flex min-w-0 flex-1 items-center justify-center p-6">
        <div className="text-center">
          <p className="text-sm font-medium">
            {props.scanning ? 'Scanning…' : props.filtered ? 'No matches' : 'No files here'}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {props.scanning
              ? 'Files will appear as they are found.'
              : props.filtered
                ? 'Try fewer words or clear the type filters.'
                : 'No STL, 3MF or G-code files were found in this view.'}
          </p>
        </div>
      </main>
    )
  }

  return (
    <main
      ref={scrollRef}
      className="min-w-0 flex-1 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClearSelection()
      }}
    >
      {props.viewMode === 'grid' ? <Grid {...props} /> : <List {...props} />}
      <div ref={sentinelRef} className="h-px" />
    </main>
  )
}

function Grid(props: Props) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3 p-4">
      {props.items.map((item) => {
        const active = props.selected.has(item.id)
        return (
          <li key={item.id}>
            <button
              type="button"
              title={item.path}
              aria-pressed={active}
              onClick={(e) => props.onItemClick(item, e)}
              className={[
                'flex w-full flex-col overflow-hidden rounded-lg border text-left transition-colors',
                active
                  ? 'border-accent ring-2 ring-accent/40'
                  : 'border-zinc-200 hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600'
              ].join(' ')}
            >
              <Thumb item={item} />
              <div className="px-2.5 py-2">
                <p className="line-clamp-2 text-xs leading-snug font-medium break-all">
                  <Highlight text={item.name} terms={props.terms} />
                </p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  {formatBytes(item.size)} · {formatDate(item.mtime)}
                </p>
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

// Placeholder until thumbnails are generated: a type badge on a tinted tile.
function Thumb({ item }: { item: FileItem }) {
  return (
    <div className="relative grid aspect-[4/3] place-items-center bg-zinc-100 dark:bg-zinc-900">
      <svg viewBox="0 0 24 24" className="size-10 text-zinc-300 dark:text-zinc-700" aria-hidden>
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          d="M12 2.5 21 7.5v9L12 21.5 3 16.5v-9L12 2.5Zm0 0v0M3 7.5l9 5 9-5M12 12.5v9"
        />
      </svg>
      <TypeBadge item={item} className="absolute top-2 left-2" />
    </div>
  )
}

function TypeBadge({ item, className = '' }: { item: FileItem; className?: string }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${TYPE_STYLE[item.type]} ${className}`}
    >
      {item.ext === 'gcode.3mf' ? 'GCODE.3MF' : TYPE_LABEL[item.type].toUpperCase()}
    </span>
  )
}

const COLUMNS: { key: SortKey | null; label: string; className: string }[] = [
  { key: 'name', label: 'Name', className: 'w-auto' },
  { key: 'type', label: 'Type', className: 'w-28' },
  { key: 'size', label: 'Size', className: 'w-24 text-right' },
  { key: 'mtime', label: 'Modified', className: 'w-44' },
  { key: null, label: 'Folder', className: 'w-1/3' }
]

function List(props: Props) {
  return (
    <table className="w-full table-fixed text-xs">
      <thead className="sticky top-0 z-10 bg-zinc-50 dark:bg-[#0f1115]">
        <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800">
          {COLUMNS.map((col) => (
            <th key={col.label} className={`px-3 py-2 font-medium ${col.className}`}>
              {col.key ? (
                <button
                  type="button"
                  className="hover:text-zinc-900 dark:hover:text-zinc-100"
                  onClick={() =>
                    props.onSort(col.key!, props.sort === col.key ? !props.desc : col.key !== 'name')
                  }
                >
                  {col.label}
                  {props.sort === col.key && <span aria-hidden> {props.desc ? '↓' : '↑'}</span>}
                </button>
              ) : (
                col.label
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {props.items.map((item) => {
          const active = props.selected.has(item.id)
          return (
            <tr
              key={item.id}
              aria-selected={active}
              onClick={(e) => props.onItemClick(item, e)}
              className={[
                'cursor-default border-b border-zinc-100 dark:border-zinc-900',
                active ? 'bg-accent/15' : 'hover:bg-zinc-100 dark:hover:bg-zinc-900'
              ].join(' ')}
            >
              <td className="truncate px-3 py-1.5 font-medium" title={item.name}>
                <Highlight text={item.name} terms={props.terms} />
              </td>
              <td className="px-3 py-1.5">
                <TypeBadge item={item} />
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">{formatBytes(item.size)}</td>
              <td className="px-3 py-1.5 text-zinc-500">{formatDate(item.mtime, true)}</td>
              <td className="truncate px-3 py-1.5 text-zinc-500" title={item.path}>
                {dirname(item.path, item.name)}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
