// Types shared by the main process, the preload bridge and the renderer.

export interface AppInfo {
  name: string
  version: string
  dataDir: string
  dbPath: string
  schemaVersion: number
}

export interface Folder {
  id: number
  path: string
  recursive: boolean
  offline: boolean
  addedAt: string
  fileCount: number
}

export type AddFolderResult =
  | { ok: true; folder: Folder }
  | { ok: false; reason: 'cancelled' | 'duplicate' | 'nested' | 'not-found'; message: string }

export interface Tag {
  id: number
  name: string
  color: string
  fileCount: number
}

// Colors offered for tags; new tags take the next one in turn.
export const TAG_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#a16207',
  '#64748b'
]

export const MAX_TAG_NAME = 40
export const MAX_COLLECTION_NAME = 80

// Why `name` can't name a tag or collection, or null if it can. Double quotes
// are left out so every name can be typed in a tag:"…" or in:"…" search.
export function labelProblem(kind: 'tag' | 'collection', name: string): string | null {
  const max = kind === 'tag' ? MAX_TAG_NAME : MAX_COLLECTION_NAME
  if (name.trim() === '') return 'Enter a name.'
  if (name.includes('"')) return 'A name can\'t contain double quotes (").'
  if (name.length > max) return `Keep the name under ${max + 1} characters.`
  return null
}

export interface Collection {
  id: number
  name: string
  description: string | null
  fileCount: number
}

export interface LibraryStats {
  files: number
  untagged: number
  missing: number
}

export type FileType = 'stl' | '3mf' | 'gcode'

// Extensions 3FM catalogs, longest first so ".gcode.3mf" wins over ".3mf".
// A Bambu/Orca ".gcode.3mf" is a sliced plate, so it counts as G-code.
export const FILE_EXTENSIONS: { ext: string; type: FileType }[] = [
  { ext: 'gcode.3mf', type: 'gcode' },
  { ext: 'gcode', type: 'gcode' },
  { ext: '3mf', type: '3mf' },
  { ext: 'stl', type: 'stl' }
]

export function extensionOf(fileName: string): { ext: string; type: FileType } | null {
  const lower = fileName.toLowerCase()
  return FILE_EXTENSIONS.find((e) => lower.endsWith('.' + e.ext)) ?? null
}

export interface FileItem {
  id: number
  folderId: number
  path: string
  name: string
  ext: string
  type: FileType
  size: number
  mtime: number
  missing: boolean
  tagIds: number[]
  collectionIds: number[]
}

export type LibraryView = 'all' | 'recent' | 'untagged' | 'missing'

export type Scope =
  | { kind: 'library'; id: LibraryView }
  | { kind: 'collection'; id: number }
  | { kind: 'tag'; id: number }
  | { kind: 'folder'; id: number }

export type SortKey = 'name' | 'mtime' | 'size' | 'type'

export interface FileQuery {
  scope: Scope
  search: string
  types: FileType[]
  sort: SortKey
  desc: boolean
  offset: number
  limit: number
}

export interface FileQueryResult {
  total: number
  items: FileItem[]
  // Plain words from the search box, for highlighting matches in names.
  terms: string[]
}

export interface ScanProgress {
  folderId: number
  path: string
  phase: 'scanning' | 'done' | 'offline' | 'error'
  seen: number
  added: number
  updated: number
  missing: number
  message?: string
}

// A slicer or other program files can be opened with.
export interface ExternalApp {
  id: number
  name: string
  exePath: string
  autoDetected: boolean
  // Extensions it handles; null means any cataloged type.
  exts: string[] | null
}

export interface AppsState {
  apps: ExternalApp[]
  // Extension ("stl", "gcode.3mf", …) → app id. Unlisted extensions use the Windows default.
  defaults: Record<string, number>
}

export type OpResult = { ok: true } | { ok: false; message: string }

export type RenameResult = { ok: true; file: FileItem } | { ok: false; message: string }

export interface TrashResult {
  trashed: number[]
  failed: { name: string; message: string }[]
}

export type TagResult = { ok: true; tag: Tag } | { ok: false; message: string }

export type CollectionResult = { ok: true; collection: Collection } | { ok: false; message: string }

export type AddAppResult =
  | { ok: true; state: AppsState }
  | { ok: false; reason: 'cancelled' | 'duplicate'; message: string }

export interface ThreeFmApi {
  app: {
    info(): Promise<AppInfo>
  }
  library: {
    stats(): Promise<LibraryStats>
  }
  folders: {
    list(): Promise<Folder[]>
    pickAndAdd(): Promise<AddFolderResult>
    remove(id: number): Promise<void>
    reveal(id: number): Promise<void>
    rescan(id: number): Promise<void>
    // Subscribe to scan progress; returns an unsubscribe function.
    onScanProgress(listener: (progress: ScanProgress) => void): () => void
  }
  files: {
    query(query: FileQuery): Promise<FileQueryResult>
    // Opens with the given app, or with each extension's default when appId is null.
    open(ids: number[], appId: number | null): Promise<OpResult>
    // Opens with the Windows default program, ignoring 3FM's per-type defaults.
    openSystem(ids: number[]): Promise<OpResult>
    reveal(id: number): Promise<void>
    copyPaths(ids: number[]): Promise<void>
    rename(id: number, name: string): Promise<RenameResult>
    // Names of files on drives without a Recycle Bin (deleting them may be permanent).
    trashWarnings(ids: number[]): Promise<string[]>
    trash(ids: number[]): Promise<TrashResult>
  }
  apps: {
    list(): Promise<AppsState>
    detect(): Promise<AppsState>
    pickAndAdd(): Promise<AddAppResult>
    remove(id: number): Promise<AppsState>
    setDefault(ext: string, appId: number | null): Promise<AppsState>
  }
  tags: {
    list(): Promise<Tag[]>
    create(name: string, color?: string): Promise<TagResult>
    update(id: number, changes: { name?: string; color?: string }): Promise<TagResult>
    remove(id: number): Promise<void>
    // Adds the tag to the files (on) or takes it off them.
    assign(fileIds: number[], tagId: number, on: boolean): Promise<void>
  }
  collections: {
    list(): Promise<Collection[]>
    create(name: string, description?: string | null): Promise<CollectionResult>
    update(id: number, changes: { name?: string; description?: string | null }): Promise<CollectionResult>
    remove(id: number): Promise<void>
    // Adds the files to the collection (on) or takes them out.
    assign(fileIds: number[], collectionId: number, on: boolean): Promise<void>
  }
}

// Custom scheme the renderer fetches cataloged files through: threefm://file/<id>
export const FILE_PROTOCOL = 'threefm'
export const fileUrl = (id: number): string => `${FILE_PROTOCOL}://file/${id}`

export const IPC = {
  appInfo: 'app:info',
  libraryStats: 'library:stats',
  foldersList: 'folders:list',
  foldersPickAndAdd: 'folders:pick-and-add',
  foldersRemove: 'folders:remove',
  foldersReveal: 'folders:reveal',
  foldersRescan: 'folders:rescan',
  scanProgress: 'scan:progress',
  filesQuery: 'files:query',
  filesOpen: 'files:open',
  filesOpenSystem: 'files:open-system',
  filesReveal: 'files:reveal',
  filesCopyPaths: 'files:copy-paths',
  filesRename: 'files:rename',
  filesTrashWarnings: 'files:trash-warnings',
  filesTrash: 'files:trash',
  appsList: 'apps:list',
  appsDetect: 'apps:detect',
  appsPickAndAdd: 'apps:pick-and-add',
  appsRemove: 'apps:remove',
  appsSetDefault: 'apps:set-default',
  tagsList: 'tags:list',
  tagsCreate: 'tags:create',
  tagsUpdate: 'tags:update',
  tagsRemove: 'tags:remove',
  tagsAssign: 'tags:assign',
  collectionsList: 'collections:list',
  collectionsCreate: 'collections:create',
  collectionsUpdate: 'collections:update',
  collectionsRemove: 'collections:remove',
  collectionsAssign: 'collections:assign'
} as const
