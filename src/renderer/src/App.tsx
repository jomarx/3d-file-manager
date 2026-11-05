import { useCallback, useEffect, useState } from 'react'
import type { Collection, Folder, LibraryStats, Tag } from '@shared/api'
import Sidebar from './components/Sidebar'
import Toolbar from './components/Toolbar'
import FileArea from './components/FileArea'
import PreviewPanel from './components/PreviewPanel'
import type { FileType, Selection, ViewMode } from './types'

const EMPTY_STATS: LibraryStats = { files: 0, untagged: 0, missing: 0 }

export default function App() {
  const [folders, setFolders] = useState<Folder[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [stats, setStats] = useState<LibraryStats>(EMPTY_STATS)
  const [selection, setSelection] = useState<Selection>({ kind: 'library', id: 'all' })
  const [query, setQuery] = useState('')
  const [types, setTypes] = useState<Set<FileType>>(new Set())
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [notice, setNotice] = useState<string | null>(null)

  const refresh = useCallback(async () => {
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
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 5000)
    return () => clearTimeout(timer)
  }, [notice])

  const addFolder = async () => {
    const result = await window.api.folders.pickAndAdd()
    if (result.ok) {
      await refresh()
      setSelection({ kind: 'folder', id: result.folder.id })
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
    if (selection.kind === 'folder' && selection.id === folder.id) {
      setSelection({ kind: 'library', id: 'all' })
    }
    await refresh()
  }

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        query={query}
        onQueryChange={setQuery}
        types={types}
        onTypesChange={setTypes}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />
      <div className="flex min-h-0 flex-1">
        <Sidebar
          stats={stats}
          folders={folders}
          tags={tags}
          collections={collections}
          selection={selection}
          onSelect={setSelection}
          onAddFolder={addFolder}
          onRemoveFolder={removeFolder}
          onRevealFolder={(f) => void window.api.folders.reveal(f.id)}
        />
        <FileArea
          hasFolders={folders.length > 0}
          query={query}
          viewMode={viewMode}
          onAddFolder={addFolder}
        />
        <PreviewPanel />
      </div>
      {notice && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-md bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900"
        >
          {notice}
        </div>
      )}
    </div>
  )
}
