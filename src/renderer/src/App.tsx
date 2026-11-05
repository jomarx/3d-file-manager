import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import type { Collection, FileItem, Folder, LibraryStats, ScanProgress, Tag } from '@shared/api'
import Sidebar from './components/Sidebar'
import Toolbar from './components/Toolbar'
import FileArea from './components/FileArea'
import PreviewPanel from './components/PreviewPanel'
import { useDebounced, useFiles } from './hooks/useFiles'
import { numberFormat } from './format'
import type { FileType, Selection, SortKey, ViewMode } from './types'

const EMPTY_STATS: LibraryStats = { files: 0, untagged: 0, missing: 0 }

export default function App() {
  const [folders, setFolders] = useState<Folder[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [stats, setStats] = useState<LibraryStats>(EMPTY_STATS)
  const [scans, setScans] = useState<Map<number, ScanProgress>>(new Map())
  const [scope, setScope] = useState<Selection>({ kind: 'library', id: 'all' })
  const [query, setQuery] = useState('')
  const [types, setTypes] = useState<Set<FileType>>(new Set())
  const [sort, setSort] = useState<SortKey>('name')
  const [desc, setDesc] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [notice, setNotice] = useState<string | null>(null)
  const anchor = useRef<number | null>(null)

  const search = useDebounced(query, 150)
  const typeList = useMemo(() => [...types].sort(), [types])
  const files = useFiles({ scope, search, types: typeList, sort, desc })

  const refreshSidebar = useCallback(async () => {
    const [f, t, c, s] = await Promise.all([
      window.api.folders.list(),
      window.api.tags.list(),
      window.api.collections.list(),
      window.api.library.stats()
    ])
    setFolders(f)
    setTags(t)
    setCollections(c)
    setStats(s)
  }, [])

  useEffect(() => {
    void refreshSidebar()
  }, [refreshSidebar])

  // Keep counts and results current while folders are being scanned.
  const refreshFiles = useRef(files.refresh)
  refreshFiles.current = files.refresh
  useEffect(
    () =>
      window.api.folders.onScanProgress((progress) => {
        setScans((prev) => {
          const next = new Map(prev)
          if (progress.phase === 'scanning') next.set(progress.folderId, progress)
          else next.delete(progress.folderId)
          return next
        })
        if (progress.phase === 'error') setNotice(`Scan of ${progress.path} failed: ${progress.message}`)
        if (progress.phase === 'offline') setNotice(`${progress.path} is offline. Its files are kept.`)
        void refreshSidebar()
        refreshFiles.current()
      }),
    [refreshSidebar]
  )

  // A new view starts with nothing selected.
  useEffect(() => {
    setSelected(new Set())
    anchor.current = null
  }, [scope, search, typeList])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 5000)
    return () => clearTimeout(timer)
  }, [notice])

  const selectedItems = useMemo(
    () => files.items.filter((f) => selected.has(f.id)),
    [files.items, selected]
  )

  const onItemClick = (item: FileItem, e: MouseEvent) => {
    const additive = e.ctrlKey || e.metaKey
    if (e.shiftKey && anchor.current !== null) {
      const ids = files.items.map((f) => f.id)
      const a = ids.indexOf(anchor.current)
      const b = ids.indexOf(item.id)
      if (a !== -1 && b !== -1) {
        const range = ids.slice(Math.min(a, b), Math.max(a, b) + 1)
        setSelected((prev) => new Set(additive ? [...prev, ...range] : range))
        return
      }
    }
    anchor.current = item.id
    if (additive) {
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(item.id)) next.delete(item.id)
        else next.add(item.id)
        return next
      })
    } else {
      setSelected(new Set([item.id]))
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if (e.key === 'Escape') setSelected(new Set())
      if (e.key === 'a' && (e.ctrlKey || e.metaKey) && !typing) {
        e.preventDefault()
        setSelected(new Set(files.items.map((f) => f.id)))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [files.items])

  const addFolder = async () => {
    const result = await window.api.folders.pickAndAdd()
    if (result.ok) {
      await refreshSidebar()
      setScope({ kind: 'folder', id: result.folder.id })
    } else if (result.reason !== 'cancelled') {
      setNotice(result.message)
    }
  }

  const removeFolder = async (folder: Folder) => {
    const confirmed = window.confirm(
      `Remove ${folder.path} from the catalog?\n\n` +
        'Files on disk are not touched, but tags and collection entries for files in this folder will be removed.'
    )
    if (!confirmed) return
    await window.api.folders.remove(folder.id)
    if (scope.kind === 'folder' && scope.id === folder.id) {
      setScope({ kind: 'library', id: 'all' })
    }
    await refreshSidebar()
    files.refresh()
  }

  const onSortChange = (nextSort: SortKey, nextDesc: boolean) => {
    setSort(nextSort)
    setDesc(nextDesc)
  }

  const scanning = scans.size > 0
  const filtered = search.trim() !== '' || types.size > 0

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        query={query}
        onQueryChange={setQuery}
        types={types}
        onTypesChange={setTypes}
        sort={sort}
        desc={desc}
        onSortChange={onSortChange}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />
      <div className="flex min-h-0 flex-1">
        <Sidebar
          stats={stats}
          folders={folders}
          tags={tags}
          collections={collections}
          scans={scans}
          selection={scope}
          onSelect={setScope}
          onAddFolder={addFolder}
          onRemoveFolder={removeFolder}
          onRevealFolder={(f) => void window.api.folders.reveal(f.id)}
          onRescanFolder={(f) => void window.api.folders.rescan(f.id)}
        />
        <FileArea
          hasFolders={folders.length > 0}
          scanning={scanning}
          items={files.items}
          total={files.total}
          terms={files.terms}
          filtered={filtered}
          viewMode={viewMode}
          sort={sort}
          desc={desc}
          onSort={onSortChange}
          selected={selected}
          onItemClick={onItemClick}
          onClearSelection={() => setSelected(new Set())}
          onLoadMore={files.loadMore}
          onAddFolder={addFolder}
        />
        <PreviewPanel selected={selectedItems} />
      </div>
      <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-zinc-200 px-4 text-[11px] text-zinc-500 dark:border-zinc-800">
        <span>
          {numberFormat.format(files.total)} {files.total === 1 ? 'file' : 'files'}
          {selected.size > 0 && ` · ${numberFormat.format(selected.size)} selected`}
        </span>
        {scanning && (
          <span className="ml-auto">
            Scanning {scans.size} {scans.size === 1 ? 'folder' : 'folders'}…
          </span>
        )}
      </footer>
      {notice && (
        <div
          role="status"
          className="fixed bottom-10 left-1/2 -translate-x-1/2 rounded-md bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900"
        >
          {notice}
        </div>
      )}
    </div>
  )
}
