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
  }
  collections: {
    list(): Promise<Collection[]>
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
  collectionsList: 'collections:list'
} as const
