import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type ScanProgress, type ThreeFmApi } from '@shared/api'

const api: ThreeFmApi = {
  app: {
    info: () => ipcRenderer.invoke(IPC.appInfo)
  },
  library: {
    stats: () => ipcRenderer.invoke(IPC.libraryStats)
  },
  folders: {
    list: () => ipcRenderer.invoke(IPC.foldersList),
    pickAndAdd: () => ipcRenderer.invoke(IPC.foldersPickAndAdd),
    remove: (id) => ipcRenderer.invoke(IPC.foldersRemove, id),
    reveal: (id) => ipcRenderer.invoke(IPC.foldersReveal, id),
    rescan: (id) => ipcRenderer.invoke(IPC.foldersRescan, id),
    onScanProgress: (listener) => {
      const handler = (_e: Electron.IpcRendererEvent, progress: ScanProgress) => listener(progress)
      ipcRenderer.on(IPC.scanProgress, handler)
      return () => ipcRenderer.removeListener(IPC.scanProgress, handler)
    }
  },
  files: {
    query: (query) => ipcRenderer.invoke(IPC.filesQuery, query),
    open: (ids, appId) => ipcRenderer.invoke(IPC.filesOpen, ids, appId),
    openSystem: (ids) => ipcRenderer.invoke(IPC.filesOpenSystem, ids),
    reveal: (id) => ipcRenderer.invoke(IPC.filesReveal, id),
    copyPaths: (ids) => ipcRenderer.invoke(IPC.filesCopyPaths, ids),
    rename: (id, name) => ipcRenderer.invoke(IPC.filesRename, id, name),
    trashWarnings: (ids) => ipcRenderer.invoke(IPC.filesTrashWarnings, ids),
    trash: (ids) => ipcRenderer.invoke(IPC.filesTrash, ids),
    locate: (id) => ipcRenderer.invoke(IPC.filesLocate, id),
    removeMissing: () => ipcRenderer.invoke(IPC.filesRemoveMissing),
    saveThumb: (id, mtime, png) => ipcRenderer.invoke(IPC.filesSaveThumb, id, mtime, png)
  },
  apps: {
    list: () => ipcRenderer.invoke(IPC.appsList),
    detect: () => ipcRenderer.invoke(IPC.appsDetect),
    pickAndAdd: () => ipcRenderer.invoke(IPC.appsPickAndAdd),
    remove: (id) => ipcRenderer.invoke(IPC.appsRemove, id),
    setDefault: (ext, appId) => ipcRenderer.invoke(IPC.appsSetDefault, ext, appId)
  },
  tags: {
    list: () => ipcRenderer.invoke(IPC.tagsList),
    create: (name, color) => ipcRenderer.invoke(IPC.tagsCreate, name, color),
    update: (id, changes) => ipcRenderer.invoke(IPC.tagsUpdate, id, changes),
    remove: (id) => ipcRenderer.invoke(IPC.tagsRemove, id),
    assign: (fileIds, tagId, on) => ipcRenderer.invoke(IPC.tagsAssign, fileIds, tagId, on)
  },
  collections: {
    list: () => ipcRenderer.invoke(IPC.collectionsList),
    create: (name, description) => ipcRenderer.invoke(IPC.collectionsCreate, name, description),
    update: (id, changes) => ipcRenderer.invoke(IPC.collectionsUpdate, id, changes),
    remove: (id) => ipcRenderer.invoke(IPC.collectionsRemove, id),
    assign: (fileIds, collectionId, on) => ipcRenderer.invoke(IPC.collectionsAssign, fileIds, collectionId, on)
  }
}

contextBridge.exposeInMainWorld('api', api)
