import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from 'react'
import type { AppsState, Collection, FileItem, Folder, LibraryStats, ScanProgress, Tag } from '@shared/api'
import Sidebar from './components/Sidebar'
import Toolbar from './components/Toolbar'
import FileArea from './components/FileArea'
import PreviewPanel from './components/PreviewPanel'
import Menu, { type MenuAt } from './components/Menu'
import TrashDialog from './components/TrashDialog'
import AppsDialog from './components/AppsDialog'
import LabelDialog from './components/LabelDialog'
import ConfirmDialog from './components/ConfirmDialog'
import OrganizeSection from './components/OrganizeSection'
import { useDebounced, useFiles } from './hooks/useFiles'
import { useFileActions } from './hooks/useFileActions'
import { useOrganize } from './hooks/useOrganize'
import { startFileDrag } from './drag'
import { EMPTY_APPS } from './apps'
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
  const [apps, setApps] = useState<AppsState>(EMPTY_APPS)
  const [appsOpen, setAppsOpen] = useState(false)
  const [menu, setMenu] = useState<MenuAt | null>(null)
  const [renaming, setRenaming] = useState(false)
  const anchor = useRef<number | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])

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
    void window.api.apps.list().then(setApps)
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

  // Files that leave the view (untagged, removed from the open collection…) leave the selection too.
  useEffect(() => {
    setSelected((prev) => {
      const present = new Set(files.items.map((f) => f.id))
      const kept = [...prev].filter((id) => present.has(id))
      return kept.length === prev.size ? prev : new Set(kept)
    })
  }, [files.items])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 5000)
    return () => clearTimeout(timer)
  }, [notice])

  useEffect(() => setRenaming(false), [selected])

  const selectedItems = useMemo(
    () => files.items.filter((f) => selected.has(f.id)),
    [files.items, selected]
  )

  const actions = useFileActions({
    apps,
    notify: setNotice,
    changed: () => {
      files.refresh()
      void refreshSidebar()
    },
    removed: (ids) =>
      setSelected((prev) => {
        const next = new Set(prev)
        for (const id of ids) next.delete(id)
        return next
      }),
    startRename: () => setRenaming(true),
    manageApps: () => setAppsOpen(true)
  })

  const organize = useOrganize({
    tags,
    collections,
    scope,
    setScope,
    notify: setNotice,
    changed: () => {
      files.refresh()
      void refreshSidebar()
    },
    openMenu: setMenu
  })
  const tagsById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags])

  // Right-clicking outside the selection selects just that file, like Explorer.
  const onItemContextMenu = (item: FileItem, e: MouseEvent) => {
    e.preventDefault()
    let targets = selectedItems
    if (!selected.has(item.id)) {
      anchor.current = item.id
      setSelected(new Set([item.id]))
      targets = [item]
    }
    const organizeEntries = organize.fileMenuEntries(targets, e.clientX, e.clientY)
    setMenu({ x: e.clientX, y: e.clientY, entries: actions.menuEntries(targets, organizeEntries) })
  }

  // Dragging a selected file carries the whole selection, like Explorer.
  const onItemDragStart = (item: FileItem, e: DragEvent) => {
    const dragged = selected.has(item.id) ? selectedItems : [item]
    if (!selected.has(item.id)) {
      anchor.current = item.id
      setSelected(new Set([item.id]))
    }
    startFileDrag(e, dragged.map((f) => f.id), dragged.length === 1 ? item.name : `${dragged.length} files`)
  }

  const onItemOpen = (item: FileItem) => void actions.open(selected.has(item.id) ? selectedItems : [item])

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

  // Reassigned every render so the listener below always sees current state.
  const onKey = useRef<(e: KeyboardEvent) => void>(() => undefined)
  onKey.current = (e) => {
    const target = e.target as HTMLElement
    const typing =
      target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
    const modal = appsOpen || actions.pendingTrash || organize.dialogOpen
    if (modal) return
    if (e.key === 'Escape') setSelected(new Set())
    if (e.key === 'a' && (e.ctrlKey || e.metaKey) && !typing) {
      e.preventDefault()
      setSelected(new Set(files.items.map((f) => f.id)))
    }
    if (typing || selectedItems.length === 0) return
    const single = selectedItems.length === 1 && !selectedItems[0].missing
    // Enter on a toolbar or panel button should press that button instead.
    if (e.key === 'Enter' && (target === document.body || target.closest('[data-files]'))) {
      e.preventDefault()
      void actions.open(selectedItems)
    } else if (e.key === 'F2' && single) {
      e.preventDefault()
      setRenaming(true)
    } else if (e.key === 'Delete') {
      e.preventDefault()
      void actions.requestTrash(selectedItems)
    }
  }
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey.current(e)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

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
        onManageApps={() => setAppsOpen(true)}
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
          onNewCollection={() => organize.startCreate('collection')}
          onNewTag={() => organize.startCreate('tag')}
          onLabelMenu={(kind, label, e) =>
            setMenu({ x: e.clientX, y: e.clientY, entries: organize.labelMenuEntries(kind, label) })
          }
          onDropFiles={(kind, id, fileIds) => void organize.dropFiles(kind, id, fileIds)}
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
          onItemOpen={onItemOpen}
          onItemContextMenu={onItemContextMenu}
          onItemDragStart={onItemDragStart}
          tags={tagsById}
          onClearSelection={() => setSelected(new Set())}
          onLoadMore={files.loadMore}
          onAddFolder={addFolder}
        />
        <PreviewPanel
          selected={selectedItems}
          openLabel={actions.openLabel(selectedItems)}
          renaming={renaming}
          onRenamingChange={setRenaming}
          onRename={actions.rename}
          onOpen={() => void actions.open(selectedItems)}
          onOpenWith={(x, y) => setMenu({ x, y, entries: actions.openWithEntries(selectedItems) })}
          onReveal={(f) => void window.api.files.reveal(f.id)}
          onTrash={() => void actions.requestTrash(selectedItems)}
          organize={
            <OrganizeSection
              files={selectedItems}
              tags={tags}
              collections={collections}
              onSetTag={(tag, on) => void organize.setTag(selectedItems, tag, on)}
              onAddTag={(name) => organize.addTagByName(selectedItems, name)}
              onSetCollection={(c, on) => void organize.setCollection(selectedItems, c, on)}
              onCollectionMenu={(x, y) => setMenu({ x, y, entries: organize.collectionEntries(selectedItems) })}
            />
          }
        />
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
      {menu && <Menu at={menu} onClose={closeMenu} />}
      {actions.pendingTrash && (
        <TrashDialog
          files={actions.pendingTrash.files}
          permanent={actions.pendingTrash.permanent}
          onConfirm={() => void actions.confirmTrash()}
          onCancel={actions.cancelTrash}
        />
      )}
      {organize.editing && (
        <LabelDialog
          kind={organize.editing.kind}
          editing={organize.editing.label !== null}
          initial={organize.editing.initial}
          onSave={organize.save}
          onClose={organize.cancelEdit}
        />
      )}
      {organize.deleting && (
        <ConfirmDialog
          title={organize.deleting.kind === 'tag' ? 'Delete tag' : 'Delete collection'}
          confirmLabel="Delete"
          onConfirm={() => void organize.confirmDelete()}
          onCancel={organize.cancelDelete}
        >
          <p className="break-words">
            Delete the {organize.deleting.kind} "{organize.deleting.label.name}"?
          </p>
          <p className="mt-2 text-zinc-500">
            {organize.deleting.label.fileCount === 0
              ? 'No files are in it.'
              : `It is removed from ${organize.deleting.label.fileCount} ${organize.deleting.label.fileCount === 1 ? 'file' : 'files'}.`}{' '}
            The files themselves are not touched.
          </p>
        </ConfirmDialog>
      )}
      {appsOpen && <AppsDialog state={apps} onChange={setApps} onClose={() => setAppsOpen(false)} />}
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
