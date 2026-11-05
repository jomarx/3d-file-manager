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
  }
  tags: {
    list(): Promise<Tag[]>
  }
  collections: {
    list(): Promise<Collection[]>
  }
}

export const IPC = {
  appInfo: 'app:info',
  libraryStats: 'library:stats',
  foldersList: 'folders:list',
  foldersPickAndAdd: 'folders:pick-and-add',
  foldersRemove: 'folders:remove',
  foldersReveal: 'folders:reveal',
  tagsList: 'tags:list',
  collectionsList: 'collections:list'
} as const
