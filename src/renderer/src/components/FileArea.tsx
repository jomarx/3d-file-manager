import { useEffect, useRef, useState, type DragEvent, type MouseEvent } from 'react'
import { thumbUrl, type FileItem, type SortKey, type Tag } from '@shared/api'
import type { ViewMode } from '../types'
import { formatBytes, formatDate, TYPE_LABEL, TYPE_STYLE, dirname } from '../format'
import { useThumb } from '../thumbs'
import Highlight from './Highlight'

interface Props {
  hasFolders: boolean
  scanning: boolean
  items: FileItem[]
  total: number
  terms: string[]
  filtered: boolean
  // The Missing view, which explains itself and offers to forget everything in it.
  missingView: boolean
  onRemoveMissing(): void
  viewMode: ViewMode
  sort: SortKey
  desc: boolean
  onSort(sort: SortKey, desc: boolean): void
  selected: Set<number>
  // A file to bring into view; a new object scrolls again.
  scrollTo: { id: number } | null
  onItemClick(item: FileItem, event: MouseEvent): void
  onItemOpen(item: FileItem): void
  onItemContextMenu(item: FileItem, event: MouseEvent): void
  onItemDragStart(item: FileItem, event: DragEvent): void
  tags: Map<number, Tag>
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

  useEffect(() => {
    if (!props.scrollTo) return
    scrollRef.current?.querySelector(`[data-id="${props.scrollTo.id}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [props.scrollTo])

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
    const nothingMissing = props.missingView && !props.filtered
    return (
      <main className="flex min-w-0 flex-1 items-center justify-center p-6">
        <div className="text-center">
          <p className="text-sm font-medium">
            {nothingMissing
              ? 'Nothing is missing'
              : props.scanning
                ? 'Scanning…'
                : props.filtered
                  ? 'No matches'
                  : 'No files here'}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {nothingMissing
              ? 'Files that disappear from disk show up here.'
              : props.scanning
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
      data-files
      className="min-w-0 flex-1 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClearSelection()
      }}
    >
      {props.missingView && (
        <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
          <p className="min-w-0 flex-1">
            These files are no longer where the catalog last saw them. Files moved or renamed in Windows are
            matched up again when their folder is scanned. For the rest, choose Locate… to point to the file, or
            remove them from the catalog.
          </p>
          <button
            type="button"
            onClick={props.onRemoveMissing}
            className="h-7 shrink-0 rounded-md border border-amber-300 px-3 font-medium hover:bg-amber-100 dark:border-amber-500/30 dark:hover:bg-amber-500/20"
          >
            Remove all…
          </button>
        </div>
      )}
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
              data-id={item.id}
              title={item.path}
              aria-pressed={active}
              draggable
              onDragStart={(e) => props.onItemDragStart(item, e)}
              onClick={(e) => props.onItemClick(item, e)}
              onDoubleClick={() => props.onItemOpen(item)}
              onContextMenu={(e) => props.onItemContextMenu(item, e)}
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
                <p className="mt-1 flex items-center gap-1 text-[11px] text-zinc-500">
                  <span className="min-w-0 flex-1 truncate">
                    {formatBytes(item.size)} · {formatDate(item.mtime)}
                  </span>
                  <TagDots item={item} tags={props.tags} />
                </p>
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

const MAX_DOTS = 4

function itemTags(item: FileItem, tags: Map<number, Tag>): Tag[] {
  return item.tagIds
    .map((id) => tags.get(id))
    .filter((t): t is Tag => t !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name))
}

function TagDots({ item, tags }: { item: FileItem; tags: Map<number, Tag> }) {
  const list = itemTags(item, tags)
  if (list.length === 0) return null
  return (
    <span className="flex shrink-0 items-center gap-0.5" title={list.map((t) => t.name).join(', ')}>
      {list.slice(0, MAX_DOTS).map((t) => (
        <span key={t.id} className="size-2 rounded-full" style={{ backgroundColor: t.color }} />
      ))}
      {list.length > MAX_DOTS && <span className="text-[10px]">+{list.length - MAX_DOTS}</span>}
    </span>
  )
}

// The cached thumbnail, made on first sight. Until then, or for files with
// nothing to draw, a cube outline stands in.
function Thumb({ item }: { item: FileItem }) {
  const ref = useRef<HTMLDivElement>(null)
  const thumb = useThumb(item, ref)
  const [broken, setBroken] = useState<string | null>(null)
  const version = `${item.id}:${item.mtime}`
  return (
    <div ref={ref} className="relative grid aspect-[4/3] place-items-center bg-zinc-100 dark:bg-zinc-900">
      {thumb === 'ready' && broken !== version ? (
        <img
          src={thumbUrl(item.id, item.mtime)}
          alt=""
          draggable={false}
          onError={() => setBroken(version)}
          className={`absolute inset-0 h-full w-full object-contain p-1.5 ${item.missing ? 'opacity-40 grayscale' : ''}`}
        />
      ) : (
        <svg viewBox="0 0 24 24" className="size-10 text-zinc-300 dark:text-zinc-700" aria-hidden>
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
            d="M12 2.5 21 7.5v9L12 21.5 3 16.5v-9L12 2.5Zm0 0v0M3 7.5l9 5 9-5M12 12.5v9"
          />
        </svg>
      )}
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
  { key: 'type', label: 'Type', className: 'w-24' },
  { key: 'size', label: 'Size', className: 'w-20 text-right' },
  { key: 'mtime', label: 'Modified', className: 'w-40' },
  { key: null, label: 'Tags', className: 'w-32' },
  { key: null, label: 'Folder', className: 'w-1/5' }
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
              data-id={item.id}
              aria-selected={active}
              draggable
              onDragStart={(e) => props.onItemDragStart(item, e)}
              onClick={(e) => props.onItemClick(item, e)}
              onDoubleClick={() => props.onItemOpen(item)}
              onContextMenu={(e) => props.onItemContextMenu(item, e)}
              className={[
                'cursor-default border-b select-none border-zinc-100 dark:border-zinc-900',
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
              <td className="truncate px-3 py-1.5" title={itemTags(item, props.tags).map((t) => t.name).join(', ')}>
                {itemTags(item, props.tags).map((t) => (
                  <span key={t.id} className="mr-2 inline-flex items-center gap-1">
                    <span className="size-2 rounded-full" style={{ backgroundColor: t.color }} />
                    {t.name}
                  </span>
                ))}
              </td>
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
